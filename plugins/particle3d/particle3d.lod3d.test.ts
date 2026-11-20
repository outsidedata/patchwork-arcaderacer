// particle3d's mod for lod3d: the `emitter` Drawing on a real particle3d page half, handed tiles of things
// as lod3d hands them, its effects read off particle3d's ledger.
import { expect, test } from 'vitest'
import type { Plugins } from '#engine/browser.ts'
import type { Layer, Made, Thing } from '#plugins/lod3d/lod3d.sim.ts'
import { particle3d } from './particle3d.plugin.ts'
import { behaviors, type Emitter } from './particle3d.lod3d.ts'

const effects = { cap: 100, effects: { glow: [{ n: [1, 1], every: 0.5, life: [1, 1] }] } }

function page() {
  let read: ((it: unknown) => void) | undefined
  const plugins = {
    loader: { on: (_: string, f: (it: unknown) => void) => { read = f }, onWritten: () => {} },
    wire: { scene: { world: { particle3d: { effects: 'fx', hold: 1 } }, plugins: ['particle3d', 'render3d'], prefabs: { engine: { dt: 1 / 60 } } }, rows: [] },
  } as unknown as Plugins
  plugins.particle3d = particle3d()
  plugins.particle3d.tick(plugins)
  return { plugins, come: () => read!(effects) }
}
const layer = { on: ['land'], rows: { glow: {} }, cell: 10, seed: 1, density: 1, size: [1, 0] } as Layer
const made = (plugins: Plugins): Made => ({ name: 'fireflies', layer, rings: [50, 200], plugins })
const thing = (x: number, size = 1): Thing => ({ row: 'glow', at: [x, 2, 0], normal: [0, 1, 0], size, spin: 0, tint: 1, sink: 0, surface: 'land', u: x, v: 0 })
const { emitter } = behaviors()
const look: Emitter = { effect: 'glow', at: [0, 1, 0], scale: 2 }
const live = (p: Plugins) => (p.particle3d.effects as { name: string; at: number[]; life: number; age: number }[]).filter(e => e.life > e.age)

test('nothing is held until particle3d has read its effects file and holds the effect', () => {
  const p = page()
  expect(emitter.draw(look, made(p.plugins))).toBeUndefined()
  p.come()
  expect(emitter.draw(look, made(p.plugins))).toBeDefined()
  expect(emitter.draw({ effect: 'smoke' }, made(p.plugins))).toBeUndefined()
})

test('each instance runs its effect off its foot, times its size, from the frame its layer is shown', () => {
  const p = page()
  p.come()
  const d = emitter.draw(look, made(p.plugins))!
  d.arrive([thing(0), thing(5, 2)], 0)
  expect(live(p.plugins)).toEqual([])
  d.show()
  const fx = live(p.plugins)
  expect(fx.map(e => [e.name, e.at])).toEqual([['glow', [0, 3, 0]], ['glow', [5, 4, 0]]])
  expect(fx.every(e => e.life === Infinity)).toBe(true)
  // Arriving after it is shown starts at once; a shell past its shells runs nothing.
  d.arrive([thing(9)], 0)
  expect(live(p.plugins).length).toBe(3)
  expect(d.arrive([thing(20)], 1)).toBeUndefined()
  expect(live(p.plugins).length).toBe(3)
})

test('a tile moving from shell to shell runs on; one gone stops at frame; dispose stops every one', () => {
  const p = page()
  p.come()
  const d = emitter.draw({ ...look, shells: 2 }, made(p.plugins))!
  d.show()
  const near = [thing(0)], far = [thing(30)]
  const a = d.arrive(near, 0), b = d.arrive(far, 0)
  const first = live(p.plugins)[0]
  d.leave(a)
  d.arrive(near, 1)
  d.frame([])
  expect(live(p.plugins)[0]).toBe(first)
  expect(live(p.plugins).length).toBe(2)
  d.leave(b)
  d.frame([])
  expect(live(p.plugins).length).toBe(1)
  d.dispose()
  expect(live(p.plugins)).toEqual([])
})

test('the same instance is seeded the same on every page, and the numbers are checked against the rings', () => {
  const one = page(), two = page()
  one.come(); two.come()
  for (const q of [one, two]) { const d = emitter.draw(look, made(q.plugins))!; d.show(); d.arrive([thing(3)], 0) }
  const seed = (q: ReturnType<typeof page>) => (q.plugins.particle3d.effects[0] as { die: () => number }).die()
  expect(seed(one)).toBe(seed(two))
  expect(emitter.shells({ effect: 'glow' })).toBe(1)
  expect(() => emitter.check({ effect: 'glow', shells: 3 }, [50, 200], 'w', {})).toThrow('w shells 3 is not a whole number of up to 2 rings')
  expect(() => emitter.check({ effect: 'glow', at: [0, 1] }, [50], 'w', {})).toThrow('w at [0,1] is not [x, y, z] metres')
  expect(() => emitter.check({} as Emitter, [50], 'w', {})).toThrow('w names no effect')
  const bare = page()
  delete (bare.plugins as Record<string, unknown>).particle3d
  expect(() => emitter.draw(look, made(bare.plugins))).toThrow('lod3d layer fireflies runs an emitter through particle3d, which this scene does not list')
})
