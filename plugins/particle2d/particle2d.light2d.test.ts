// particle2d's mod for light2d, given by one key of a scene: `world.light2d.mods.lights` is
// ['particle2d']. The test hands a page particle2d, light2d and render2d, a flat world, a stand-in
// loader that hands over its own effects file, and the mod loaded as the scenemanager loads it; a
// torch's effect is a flame and a lamp. Node has no document for PixiJS to make the canvas a filter
// asks WebGL's precision of, so it is handed one with no WebGL.
import { expect, test } from 'vitest'
import * as PIXI from 'pixi.js'
import { mod, prepare } from '#addons/scenemanager/scenemanager.addon.ts'
import { render2d } from '#plugins/render2d/render2d.plugin.ts'
import { light2d } from '#plugins/light2d/light2d.plugin.ts'
import { particle2d, type Effects } from './particle2d.plugin.ts'
import { lights } from './particle2d.light2d.ts'

PIXI.DOMAdapter.set({ ...PIXI.DOMAdapter.get(), createCanvas: () => ({ getContext: () => null }) as any })

const DT = 1 / 60
const file: Effects = {
  cap: 50, layer: 'effects',
  effects: {
    torch: [{ every: 0.1, life: [0.3, 0.3] }, { lamp: { intensity: 0.8, distance: 4, at: [0, -6], tint: 0xffa040, flicker: 0.5 } }],
  },
}

const page = async (order = ['loader', 'particle2d', 'light2d', 'render2d']) => {
  const world: any = {
    render2d: { ground: [[16, 0], [0, 16]], up: [0, -16], zoom: 1, look: [0, 0], layers: ['effects', 'dark'] },
    particle2d: { effects: 'effects', hold: 0.1 },
    light2d: {
      layer: 'dark', ambient: { colour: 0x000000, level: 0.1 }, kinds: {}, budget: 4,
      falloff: { size: 32, core: 0.2, power: 2 }, flicker: { rate: 8, depth: 0.3 }, mods: { lights: ['particle2d'] },
    },
  }
  await prepare({} as any, [], world)
  const plugins: any = {
    wire: { n: 0, rows: [], scene: { plugins: order, world, prefabs: { engine: { dt: DT, width: 400, height: 300 } } } },
    render2d: render2d(),
    loader: { on: (_: string, f: (it: any) => void) => f(file), get: () => undefined, load: () => {}, onWritten: () => {} },
  }
  plugins.render2d.tick(plugins)
  plugins.particle2d = particle2d()
  plugins.light2d = light2d()
  const frame = () => { plugins.particle2d.afterTick(plugins); plugins.light2d.afterTick(plugins); plugins.render2d.afterTick() }
  return { plugins, world, frame }
}

test('light2d draws every lamp of particle2d\'s effects while the effect runs: at the effect\'s point and its at off it, in its tint, its distance its radius, flickering between whole and 1 - flicker of its intensity; and takes it away when the effect is over', async () => {
  const { plugins, world, frame } = await page()
  expect(mod(world, 'light2d', 'lights')).toBe(lights)
  const fx = plugins.particle2d.emit('torch', [3, 2], { life: 1, scale: 2 })
  const seen = new Set<number>()
  for (let f = 0; f < 20; f++) {
    frame()
    const lit = plugins.light2d.lights
    expect(lit).toHaveLength(1)
    const [l] = lit
    // the torch is drawn at 48, 32 on the stage, its lamp 6 above it at scale 2
    expect([l.key, l.at, l.colour, l.radius]).toEqual([`particle2d:${plugins.particle2d.lamps[0].key}`, [48, 20], 0xffa040, 8])
    expect(l.intensity).toBeLessThanOrEqual(0.8)
    expect(l.intensity).toBeGreaterThanOrEqual(0.4)
    expect(l.sprite.tint).toBe(0xffa040)
    seen.add(l.intensity)
  }
  expect(seen.size).toBeGreaterThan(5)
  fx.life = fx.age
  for (let f = 0; f < 30; f++) frame()
  expect(plugins.particle2d.effects).toEqual([])
  expect(plugins.light2d.lights).toEqual([])
})

test('light2d listed before particle2d, whose lamps it reads that frame, throws', async () => {
  const { frame } = await page(['loader', 'light2d', 'particle2d', 'render2d'])
  expect(frame).toThrow('light2d is listed before particle2d, whose lights it reads that frame')
})
