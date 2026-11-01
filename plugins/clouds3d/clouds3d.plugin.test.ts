// The clouds on render3d in node, under the real skydome3d, drawing the weather a weather3d stand-in
// hands through weather3d's `weather` mod (`weather3d.clouds3d.ts`), which the scenemanager's `load` of
// a scene of the test's own loads, as a page loads it. Node has no WebGL, so nothing is mounted: what
// the clouds did is read off the dome's material and a dressed material's shader.
import { afterAll, beforeAll, expect, test } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import * as THREE from 'three'
import { boot, type Scene } from '#engine/engine.ts'
import { load } from '#addons/scenemanager/scenemanager.addon.ts'
import { scenemanager } from '#plugins/scenemanager/scenemanager.sim.ts'
import { render3d } from '#plugins/render3d/render3d.plugin.ts'
import { skydome3d } from '#plugins/skydome3d/skydome3d.plugin.ts'
import type { Weather } from '#plugins/weather3d/weather3d.sim.ts'
import { clouds3d, PARTS, type Look, type Part } from './clouds3d.plugin.ts'

const dir = mkdtempSync(join(tmpdir(), 'clouds3d-plugin-'))
const path = (p: string) => JSON.stringify(new URL(p, import.meta.url).pathname)
writeFileSync(join(dir, 'sky.scene.json'), JSON.stringify({
  world: { clouds3d: { mods: { weather: 'weather3d' } } },
  prefabs: { engine: { dt: 1 / 30 }, scenemanager: { out: {} } },
  actors: [{ is: 'scenemanager' }],
  plugins: ['scenemanager'],
}))
writeFileSync(join(dir, 'sky.sim.ts'), `
import { scenemanager } from ${path('../scenemanager/scenemanager.sim.ts')}
import file from './sky.scene.json' with { type: 'json' }
export const sim = { scenemanager }
export const scene = file
`)
const top: Scene = {
  prefabs: { engine: { dt: 1 / 30 }, scenemanager: { scenes: { sky: { file: 'sky.scene.json', suspend: false } }, dt: 1 / 30, entry: 'sky', port: 0 } },
  actors: [{ is: 'scenemanager' }],
  plugins: ['scenemanager'],
  seats: 1,
}
beforeAll(async () => { await load(boot(structuredClone(top), { scenemanager }), pathToFileURL(dir + '/').href) })
afterAll(() => rmSync(dir, { recursive: true }))

const weather = (over: Partial<Weather>): Weather => ({
  cloud: 0, cirrus: 0.1, base: 1400, top: 2000, dense: 1, rain: 0, snow: 0, fog: 0, haze: 1.15, wind: 2.5, gust: 0.15, thunder: 0, dust: 0.05, ...over,
})
const OVERCAST = weather({ cloud: 0.8, cirrus: 0.3, base: 900, dense: 2.2 })
const LOOK: Look = { cloudScale: 0.004, cloudSharp: 0.42, cloudDrift: 0.01, cloudShadow: 0.55, godrays: 1, cloudLit: 0.35, cloudShade: 0.55, lining: 0.8, cirrusAlpha: 0.5 }
const SKY = {
  day: 1200,
  look: {
    dayZenith: '#2961b3', dayHorizon: '#bdd1e0', nightZenith: '#03050e', nightHorizon: '#090e1a', setZenith: '#47386b', setHorizon: '#fa7a38',
    sunHigh: '#fff2db', sunLow: '#ff6b29', moon: '#8cadff', ground: '#0a1218', exposure: 1.05, nightOpen: 0.35, sunIntensity: 2.4, moonIntensity: 0.35,
    hemiDay: 0.55, hemiNight: 0.12, stars: 1, haze: 0.00075, mist: 0.02, starSize: 0.15, twinkle: 0.4, twinkles: 900, twinkleSpread: 5, sunShrink: [0.05, 0.4],
    sunEdge: 0.85, moonEdge: 0.9, moonSize: 0.0045, radius: 8000, overcast: 0.2, envSun: 0.02, envMix: 0.05, envIntensity: 0.25,
  },
  shadow: { map: 2048, half: 60, near: 1, far: 1600, bias: -0.00002, normalBias: 0.04 },
}

// A page: render3d, the sky over one skydome3d row, a weather3d stand-in whose `weather()` hands
// `now`, and the clouds, the scene listing `listed`.
function page(o: { clouds?: Record<string, unknown>; listed?: string[] } = {}) {
  const now = { weather: { mix: OVERCAST, drift: [120, -40] as [number, number] } }
  const skyRow = { id: 3, kind: 'skydome3d', data: { t: 500, rate: 1, doy: 172, lat: 46, phase: 0.5 } }
  const plugins: any = {
    wire: {
      n: 0, rows: [skyRow],
      scene: {
        plugins: o.listed ?? ['skydome3d', 'weather3d', 'clouds3d', 'render3d'],
        world: { skydome3d: SKY, clouds3d: { look: LOOK, mods: { weather: 'weather3d' }, ...o.clouds } },
        prefabs: { engine: { width: 320, height: 200, dt: 1 / 30 }, render3d: { camera: { fov: 62, near: 0.15, far: 9000, at: [5, 20, 7], look: [60, 15, -40] }, tone: 'neutral', shadows: 'soft' } },
      },
    },
    render3d: render3d(),
    weather3d: { weather: () => now.weather },
  }
  plugins.skydome3d = skydome3d()
  const me = clouds3d()
  plugins.clouds3d = me
  const frame = () => {
    plugins.render3d.tick(plugins)
    plugins.skydome3d.tick(plugins)
    plugins.skydome3d.afterTick(plugins)
    me.afterTick(plugins)
  }
  return { plugins, me, skyRow, frame, now }
}
const dressed = (plugins: any) => {
  const s = { vertexShader: THREE.ShaderLib.standard.vertexShader, fragmentShader: THREE.ShaderLib.standard.fragmentShader, uniforms: {} } as unknown as THREE.WebGLProgramParametersWithUniforms
  plugins.render3d.dress(new THREE.MeshStandardMaterial()).onBeforeCompile(s, undefined as unknown as THREE.WebGLRenderer)
  return s
}

test('the deck, the cirrus and the god rays are drawn into the sky\'s dome after the sun and before the flash, from the weather standing each frame', () => {
  const { plugins, frame, now } = page()
  frame()
  const dome = plugins.skydome3d.sky().dome.material as THREE.ShaderMaterial
  expect(dome.fragmentShader).toMatch(/float sd = dot\( D, skySun \);[\s\S]*float high = 2\.6 \* skyBase;[\s\S]*vec3 deck =[\s\S]*skyGodrays[\s\S]*sky \+= vec3\( skyFlash \);/)
  expect(dome.uniforms.skyCover.value).toBe(OVERCAST.cloud)
  expect(dome.uniforms.skyBase.value).toBe(OVERCAST.base)
  expect(dome.uniforms.skyDrift.value.toArray()).toEqual([120, -40])
  now.weather = { mix: weather({ cloud: 0.2, base: 1600 }), drift: [130, -41] }
  frame()
  expect(dome.uniforms.skyCover.value).toBe(0.2)
  expect(dome.uniforms.skyBase.value).toBe(1600)
  expect(dome.uniforms.skyDrift.value.toArray()).toEqual([130, -41])
})

test('the deck\'s shadow goes into every dressed material after the sky\'s noise, toward the sky\'s sun, carried by the same drift', () => {
  const { plugins, skyRow, frame } = page()
  frame()
  const s = dressed(plugins)
  const f = s.fragmentShader
  expect(f.indexOf('vec2 skyCloudAt(')).toBeLessThan(f.indexOf('float skyCloudShadow('))
  expect(f.slice(f.indexOf('#include <lights_fragment_end>'))).toMatch(/reflectedLight\.directDiffuse \*= skyShade;/)
  const u = s.uniforms as any
  expect(u.skyDrift.value.toArray()).toEqual([120, -40])
  expect(u.skySun.value.toArray()).toEqual(plugins.skydome3d.light().sun.toArray())
  skyRow.data.t = 700
  frame()
  expect(u.skySun.value.toArray()).toEqual(plugins.skydome3d.light().sun.toArray())
})

test('each part named in off is compiled out of its shader, and a part it does not know throws', () => {
  const none = page({ clouds: { off: [...PARTS] } })
  none.frame()
  const dome = none.plugins.skydome3d.sky().dome.material.fragmentShader
  for (const part of ['cirrus', 'deck', 'godrays']) expect(dome).toContain(`#define SKY_NO_${part.toUpperCase()}\n`)
  expect(dressed(none.plugins).fragmentShader).toContain('#define SKY_NO_CLOUDSHADOW\n')
  expect(() => page({ clouds: { off: ['fog' as Part] } }).frame()).toThrow('clouds3d has no part fog to take off')
})

test('a scene that names no weather for the clouds draws no cloud', () => {
  const { plugins, frame } = page({ clouds: { mods: {} }, listed: ['skydome3d', 'clouds3d', 'render3d'] })
  frame()
  expect(plugins.skydome3d.sky().dome.material.uniforms.skyCover.value).toBe(0)
})

test('a scene that lists the clouds before the sky throws on the first frame', () => {
  expect(() => page({ listed: ['clouds3d', 'skydome3d', 'weather3d', 'render3d'] }).frame()).toThrow('clouds3d is listed before skydome3d, whose dome it draws into')
})
