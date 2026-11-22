// gpuparticle3d's attachments and its checks of a flipbook's fields, on a page with no renderer: the
// attachments are started, moved, driven and stopped on the CPU before anything is drawn, and the checks
// are run when the file is read. How its flipbooks draw is seen on the GPU with `yarn particle-views`
// (a view's `drawer`).
import { afterAll, expect, test } from 'vitest'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import * as THREE from 'three'
import { prepare } from '#addons/scenemanager/scenemanager.addon.ts'
import type { Effects, Source } from '#plugins/particle3d/particle3d.plugin.ts'
import { check, gpuparticle3d } from './gpuparticle3d.plugin.ts'

const DT = 1 / 60

// A game's own plugin, `beacon`, whose mod for gpuparticle3d hands the sources the test puts on
// `globalThis.beacons` each frame.
const home = mkdtempSync(join(tmpdir(), 'gpuparticle3d-attach-'))
afterAll(() => rmSync(home, { recursive: true }))
mkdirSync(join(home, 'plugins', 'beacon'), { recursive: true })
writeFileSync(join(home, 'plugins', 'beacon', 'beacon.gpuparticle3d.ts'), 'export const sources = () => (globalThis as any).beacons\n')
const beacons = (list: Source[]) => { (globalThis as any).beacons = list }
// And `glow`, whose `light` mod counts how many times it is asked, once a frame, and hands the share the
// test puts on `globalThis.sunlight`.
mkdirSync(join(home, 'plugins', 'glow'), { recursive: true })
writeFileSync(join(home, 'plugins', 'glow', 'glow.gpuparticle3d.ts'), 'export const light = () => { (globalThis as any).asked++; return (globalThis as any).sunlight }\n')

// The effects file with drivers a source hands, and two streams; a page whose scene attaches `attach` to
// the beacon's sources, with the mod loaded.
const attached = async (attach: unknown, sources: string[] | undefined = ['beacon']) => {
  const effects: Effects = {
    cap: 64,
    drivers: { load: 0, tint: 0, wet: 0, height: 1 },
    effects: { dust: [{ every: 0.05, life: [0.2, 0.2], tint: 'tint' }], mud: [{ every: 0.05, life: [0.2, 0.2] }] },
  }
  const world: Record<string, any> = { gpuparticle3d: { effects: 'effects', attach } }
  if (sources) world.gpuparticle3d.mods = { sources }
  world.shipped = { plugins: ['beacon'] }
  world.scenemanager = { home: pathToFileURL(home + '/').href }
  await prepare({} as any, [], world)
  const plugins: any = {
    wire: { scene: { plugins: ['loader', 'gpuparticle3d', 'render3d'], world, prefabs: { engine: { dt: DT } } }, rows: [] },
    render3d: { THREE, scene: new THREE.Scene() },
    loader: {
      on: (name: string, f: (it: any) => void) => { if (name === 'effects') f(effects) },
      onWritten: () => {},
    },
  }
  const me = gpuparticle3d()
  return { me, frame: () => me.afterTick(plugins) }
}
const running = (p: { me: ReturnType<typeof gpuparticle3d> }, name: string) => p.me.effects.filter(fx => fx.name === name && fx.life === Infinity)

test('an attachment throws its effect from every source of its word, kept on it, its point, way and floor the source\'s and its drivers the source\'s alone, a driver it gives no more going back to the file\'s', async () => {
  const p = await attached([{ on: 'wheel', effect: 'dust' }])
  beacons([
    { key: 'a', on: 'wheel', at: [1, 0, 0], dir: [0, 1, 0], floor: -0.5, drivers: { load: 4000, tint: 0xff0000 } },
    { key: 'b', on: 'wheel', at: [-1, 0, 0], drivers: { load: 100 } },
    { key: 'c', on: 'pipe', at: [0, 2, 0], drivers: {} },
  ])
  p.frame()
  const [a, b] = running(p, 'dust')
  expect(running(p, 'dust')).toHaveLength(2)
  expect([a.at, a.dir, a.floor, a.drivers]).toEqual([[1, 0, 0], [0, 1, 0], -0.5, { load: 4000, tint: 0xff0000 }])
  expect([b.at, b.dir, b.floor, b.drivers]).toEqual([[-1, 0, 0], undefined, undefined, { load: 100 }])
  // Moved, driven otherwise, and its tint let go: the same effects, now as the sources say.
  beacons([
    { key: 'a', on: 'wheel', at: [2, 0, 1], dir: [1, 0, 0], floor: 0, drivers: { load: 50 } },
    { key: 'b', on: 'wheel', at: [-1, 0, 3], drivers: { load: 100, tint: 0x00ff00 } },
  ])
  p.frame()
  expect(running(p, 'dust')).toEqual([a, b])
  expect([a.at, a.dir, a.floor, a.drivers]).toEqual([[2, 0, 1], [1, 0, 0], 0, { load: 50 }])
  expect(b.drivers).toEqual({ load: 100, tint: 0x00ff00 })
})

test('an attachment with an `of` throws from its word\'s sources of that alone, and two attachments on one word are two effects on every source of it', async () => {
  const p = await attached([{ on: 'wheel', of: 'jeep', effect: 'dust' }, { on: 'wheel', effect: 'mud' }])
  beacons([
    { key: 'a', on: 'wheel', of: 'jeep', at: [1, 0, 0], drivers: {} },
    { key: 'b', on: 'wheel', of: 'truck', at: [2, 0, 0], drivers: {} },
  ])
  p.frame()
  expect(running(p, 'dust').map(fx => fx.at[0])).toEqual([1])
  expect(running(p, 'mud').map(fx => fx.at[0])).toEqual([1, 2])
})

test('an attachment runs from the first frame its when holds, of the source\'s drivers over the file\'s, and stops the frame it does not', async () => {
  const p = await attached([{ on: 'wheel', effect: 'mud', when: 'wet and height < 0.2' }])
  const at = (wet: number, height?: number): Source[] => [{ key: 'a', on: 'wheel', at: [0, 0, 0], drivers: { wet, ...(height !== undefined && { height }) } }]
  // dry; then wet but at the file's height of 1
  beacons(at(0, 0.1))
  p.frame()
  beacons(at(1))
  p.frame()
  expect(running(p, 'mud')).toHaveLength(0)
  beacons(at(1, 0.1))
  p.frame()
  const [mud] = running(p, 'mud')
  expect(mud).toBeDefined()
  beacons(at(0, 0.1))
  p.frame()
  expect(mud.life).toBeLessThanOrEqual(mud.age)
  expect(running(p, 'mud')).toHaveLength(0)
  // wet again: a new one
  beacons(at(1, 0.1))
  p.frame()
  expect(running(p, 'mud')).toHaveLength(1)
  expect(running(p, 'mud')[0]).not.toBe(mud)
})

test('a source gone stops its effect, and one that comes again starts another', async () => {
  const p = await attached([{ on: 'wheel', effect: 'dust' }])
  beacons([{ key: 'a', on: 'wheel', at: [0, 0, 0], drivers: {} }])
  p.frame()
  const [dust] = running(p, 'dust')
  beacons([])
  p.frame()
  expect(dust.life).toBeLessThanOrEqual(dust.age)
  expect(running(p, 'dust')).toHaveLength(0)
  beacons([{ key: 'a', on: 'wheel', at: [0, 0, 0], drivers: {} }])
  p.frame()
  expect(running(p, 'dust')).toHaveLength(1)
  expect(running(p, 'dust')[0]).not.toBe(dust)
})

test('an attach that is no list of attachments, names an effect the file has none of, has a when that is no expression of its drivers, or comes with no sources, throws when the file is read; a source\'s driver the file has none of, the frame it is handed', async () => {
  beacons([])
  const read = async (attach: unknown, sources?: string[]) => {
    const p = await attached(attach, sources)
    return () => p.frame()
  }
  expect(await read({ on: 'wheel' })).toThrow('world.gpuparticle3d.attach is {"on":"wheel"}, and it is a list, each { on, effect, of, when }')
  expect(await read([{ on: 'wheel', effect: 'dust', at: 1 }])).toThrow('world.gpuparticle3d.attach 0 has at, and an attachment is { on, effect, of, when }')
  expect(await read([{ effect: 'dust' }])).toThrow('world.gpuparticle3d.attach 0 has an on of undefined, and on is the word of the sources it is thrown from')
  expect(await read([{ on: 'wheel', effect: 'smoke' }])).toThrow('world.gpuparticle3d.attach 0 throws "smoke", which the effects file has no effect of')
  expect(await read([{ on: 'wheel', effect: 'dust', when: 'deep > 1' }])).toThrow('world.gpuparticle3d.attach 0\'s when is "deep > 1", which names deep')
  expect(await read([{ on: 'wheel', effect: 'dust' }], [])).toThrow('world.gpuparticle3d has an attach, and its mods name no sources')
  const p = await attached([{ on: 'wheel', effect: 'dust' }])
  beacons([{ key: 'a', on: 'wheel', at: [0, 0, 0], drivers: { grip: 1 } }])
  expect(() => p.frame()).toThrow('gpuparticle3d\'s wheel source a is driven by grip, which its effects file has no driver of: its drivers are load, tint, wet, height')
})

test('a flipbook\'s start, blend and channels need a sheet, blend is not played with play, channels are three sets of four weights, and erode is stops of its life', () => {
  const one = (layer: Record<string, unknown>) => () => check({ cap: 8, effects: { e: [{ life: [1, 1], ...layer }] } } as Effects, {})
  const sheet = { sheet: 's', clip: 'c' }
  const lit = { value: [0.55, 0.45, 0, 0], alpha: [0, 0, 0, 1], hot: [0, 0, 0, 0] }
  expect(one({ ...sheet, start: [0, 1], blend: true, channels: lit, erode: [[0, 0], [1, 0.8]] })).not.toThrow()
  expect(one({ shape: 'puff', erode: [[0, 0], [1, 0.8]] })).not.toThrow()
  expect(one({ start: [0, 1] })).toThrow('gpuparticle3d effect e layer 0 has start and no sheet, and start is how a sheet\'s frames are drawn')
  expect(one({ shape: 'puff', blend: true })).toThrow('gpuparticle3d effect e layer 0 has blend and no sheet, and blend is how a sheet\'s frames are drawn')
  expect(one({ ...sheet, blend: true, play: true })).toThrow('gpuparticle3d effect e layer 0 has blend and play, and blend lays its frames into each other evenly over its life')
  expect(one({ ...sheet, blend: 'wet' })).toThrow('gpuparticle3d effect e layer 0 has a blend of "wet", and blend is on or off, which no driver drives')
  expect(one({ ...sheet, channels: { ...lit, hot: [1, 0] } })).toThrow('gpuparticle3d effect e layer 0 has channels whose hot is [1,0], and it is four weights, red, green, blue and alpha')
  expect(one({ ...sheet, channels: { ...lit, glow: [0, 0, 0, 0] } })).toThrow('gpuparticle3d effect e layer 0 has channels with glow, and its channels are { value, alpha, hot }')
  expect(one({ shape: 'puff', erode: [[0.5, 0], [0.2, 1]] })).toThrow('gpuparticle3d effect e layer 0 has erode of [[0.5,0],[0.2,1]], and they are [[<part of its life, 0 to 1>, <value>], ...] in order')
  expect(() => check({ cap: 8, flipbooks: [], effects: {} }, {})).not.toThrow()
})

// A page whose scene names the `light` mod, `glow` listed ahead of gpuparticle3d or after it.
const glowing = async (order: string[]) => {
  const world: Record<string, any> = { gpuparticle3d: { effects: 'effects', mods: { light: 'glow' } }, shipped: { plugins: ['glow'] }, scenemanager: { home: pathToFileURL(home + '/').href } }
  await prepare({} as any, [], world)
  const plugins: any = {
    wire: { scene: { plugins: order, world, prefabs: { engine: { dt: DT } } }, rows: [] },
    render3d: { THREE, scene: new THREE.Scene() },
    loader: { on: (name: string, f: (it: any) => void) => { if (name === 'effects') f({ cap: 8, effects: {} }) }, onWritten: () => {} },
  }
  const me = gpuparticle3d()
  return () => me.afterTick(plugins)
}

test('the `light` mod is asked once a frame, after the plugin it names has drawn; listed after gpuparticle3d it throws', async () => {
  ;(globalThis as any).asked = 0
  ;(globalThis as any).sunlight = [0.5, 0.5, 0.5]
  const frame = await glowing(['loader', 'shipped', 'gpuparticle3d', 'render3d'])
  for (let i = 0; i < 3; i++) frame()
  expect((globalThis as any).asked).toBe(3)
  const late = await glowing(['loader', 'gpuparticle3d', 'shipped', 'render3d'])
  expect(() => late()).toThrow('gpuparticle3d is listed before glow, whose light it reads that frame')
})
