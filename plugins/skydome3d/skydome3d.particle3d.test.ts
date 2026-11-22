// skydome3d's `light` mod for particle3d and gpuparticle3d: each channel of the sky's light a particle
// takes, a share of what the sky gives at its brightest. The test draws a real sky (the browser half on
// render3d, no canvas, a row and a `world.skydome3d` of its own) at noon, at midnight and at dusk and asks
// the mod what it hands, and loads a scene that names the mod for both plugins as a page loads it.
import { afterAll, expect, test } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { boot, type Scene } from '#engine/engine.ts'
import { load, mod } from '#addons/scenemanager/scenemanager.addon.ts'
import { scenemanager } from '#plugins/scenemanager/scenemanager.sim.ts'
import { render3d } from '#plugins/render3d/render3d.plugin.ts'
import { light } from './skydome3d.particle3d.ts'
import { light as gpuLight } from './skydome3d.gpuparticle3d.ts'
import { skydome3d, type Look } from './skydome3d.plugin.ts'

const DAY = 1200
const LOOK: Look = {
  dayZenith: '#2961b3', dayHorizon: '#bdd1e0', nightZenith: '#03050e', nightHorizon: '#090e1a', setZenith: '#47386b', setHorizon: '#fa7a38',
  sunHigh: '#fff2db', sunLow: '#ff6b29', moon: '#8cadff', ground: '#0a1218', exposure: 1.05, nightOpen: 0.35, sunIntensity: 2.4, moonIntensity: 0.35,
  hemiDay: 0.55, hemiNight: 0.12, stars: 1, haze: 0.00075, mist: 0.02, starSize: 0.15, twinkle: 0.4, twinkles: 900, twinkleSpread: 5, sunShrink: [0.05, 0.4],
  sunEdge: 0.85, moonEdge: 0.9, moonSize: 0.0045, radius: 8000, overcast: 0.2, envSun: 0.02, envMix: 0.05, envIntensity: 0.25,
}
const SHADOW = { map: 2048, half: 60, near: 1, far: 1600, bias: -0.00002, normalBias: 0.04 }

// A sky at the hour `t` seconds into its day, drawn once, with the plugins a mod is handed.
function sky(t: number) {
  const row = { id: 3, kind: 'skydome3d', data: { t, rate: 1, doy: 172, lat: 46, phase: 0.5 } }
  const plugins: any = {
    wire: {
      n: 0, rows: [row],
      scene: {
        plugins: ['skydome3d', 'particle3d', 'render3d'],
        world: { skydome3d: { day: DAY, look: LOOK, shadow: SHADOW } },
        prefabs: { engine: { width: 320, height: 200, dt: 1 / 30 }, render3d: { camera: { fov: 62, near: 0.15, far: 9000, at: [5, 20, 7], look: [60, 15, -40] }, tone: 'neutral', shadows: 'soft' } },
      },
    },
    render3d: render3d(),
  }
  plugins.skydome3d = skydome3d()
  const frame = () => {
    plugins.render3d.tick(plugins)
    plugins.skydome3d.tick(plugins)
    plugins.skydome3d.afterTick(plugins)
  }
  return { plugins, frame }
}

test('before the sky has drawn there is no light to hand, so the plugin draws in a particle\'s own colour', () => {
  expect(light(sky(DAY / 2).plugins)).toBeUndefined()
})

test('a clear noon is the sky at its brightest: every channel 1', () => {
  const { plugins, frame } = sky(DAY / 2)
  frame()
  for (const share of light(plugins)!) expect(share).toBeCloseTo(1, 3)
})

test('at midnight a particle takes a small share of its colour, bluer than red as the moon and the night horizon are', () => {
  const { plugins, frame } = sky(0)
  frame()
  const [r, g, b] = light(plugins)!
  for (const share of [r, g, b]) {
    expect(share).toBeGreaterThan(0)
    expect(share).toBeLessThan(0.25)
  }
  expect(b).toBeGreaterThan(r)
})

test('the light falls from noon to midnight and rises again, and at dusk it is warmer than at midnight and dimmer than at noon', () => {
  const at = (t: number) => {
    const { plugins, frame } = sky(t)
    frame()
    return light(plugins)!
  }
  const noon = at(DAY / 2), dusk = at(DAY * 0.78), midnight = at(0), dawn = at(DAY * 0.22)
  const mean = (c: number[]) => (c[0] + c[1] + c[2]) / 3
  expect(mean(dusk)).toBeLessThan(mean(noon))
  expect(mean(midnight)).toBeLessThan(mean(dusk))
  expect(mean(midnight)).toBeLessThan(mean(dawn))
  expect(dusk[0] / dusk[2]).toBeGreaterThan(noon[0] / noon[2])
})

// A manager and a child that names the mod for both plugins, loaded as a page loads it.
const dir = mkdtempSync(join(tmpdir(), 'skydome3d-particle3d-'))
const path = (p: string) => JSON.stringify(new URL(p, import.meta.url).pathname)
writeFileSync(join(dir, 'night.scene.json'), JSON.stringify({
  world: { skydome3d: { day: DAY }, particle3d: { mods: { light: 'skydome3d' } }, gpuparticle3d: { mods: { light: 'skydome3d' } } },
  prefabs: { engine: { dt: 1 / 60 }, skydome3d: { t: 0, rate: 1, doy: 172, lat: 46, phase: 0.25 } },
  actors: [{ is: 'skydome3d' }],
}))
writeFileSync(join(dir, 'night.sim.ts'), `
import { skydome3d } from ${path('./skydome3d.sim.ts')}
import file from './night.scene.json' with { type: 'json' }
export const sim = { skydome3d }
export const scene = file
`)
afterAll(() => rmSync(dir, { recursive: true }))
const top: Scene = {
  prefabs: { engine: { dt: 1 / 60 }, scenemanager: { scenes: { night: { file: 'night.scene.json', suspend: false } }, dt: 1 / 60, entry: 'night', port: 0 } },
  actors: [{ is: 'scenemanager' }],
  plugins: ['scenemanager'],
  seats: 1,
}

test('the scene\'s key gives each plugin this light, loaded before the first step', async () => {
  const child = (await load(boot(structuredClone(top), { scenemanager }), pathToFileURL(dir + '/').href)).get('night')!
  expect(mod(child.world, 'particle3d', 'light')).toBe(light)
  expect(mod(child.world, 'gpuparticle3d', 'light')).toBe(gpuLight)
})
