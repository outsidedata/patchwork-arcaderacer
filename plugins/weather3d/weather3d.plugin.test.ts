// The weather's browser half on render3d in node, under the real skydome3d, drawing a weather3d row, a
// skydome3d row and the `world.weather3d` and `world.skydome3d` this test writes, as a scene splits
// them. Node has no WebGL, so nothing is mounted: what the weather made is read off three's objects.
// The land is a terrain3d stand-in's ground through terrain3d's `land` mod (`terrain3d.weather3d.ts`),
// and the sky's clock reaches the weather through skydome3d's `sky` mod (`skydome3d.weather3d.ts`);
// both are loaded as a page loads them, by the scenemanager's `load` of a scene of the test's own that
// names them, written to a temp folder, before any page.
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
import { here, wind, type Weather, type Weathered } from './weather3d.sim.ts'
import { PARTS, weather3d, type Part, type Precip } from './weather3d.plugin.ts'

const MODS = { weather3d: { land: 'terrain3d', sky: 'skydome3d' }, skydome3d: { weather: 'weather3d' } }
const dir = mkdtempSync(join(tmpdir(), 'weather3d-plugin-'))
const path = (p: string) => JSON.stringify(new URL(p, import.meta.url).pathname)
writeFileSync(join(dir, 'sky.scene.json'), JSON.stringify({
  world: { weather3d: { mods: MODS.weather3d }, skydome3d: { mods: MODS.skydome3d } },
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
const STORM = weather({ cloud: 0.97, base: 450, top: 4200, dense: 3.4, rain: 1, fog: 0.42, haze: 2.8, wind: 14, gust: 0.85, thunder: 9 })
const SNOW = weather({ cloud: 0.9, base: 700, dense: 1.9, snow: 0.55, fog: 0.35, haze: 2.2, wind: 4, gust: 0.35, dust: 0.3 })
const PRECIP: Precip = {
  rain: 24000, snow: 18000, dust: 2600, splashes: 280, range: 26, edge: 3, near: 1.5, rainFall: 16, rainLen: 0.24, rainWidth: 0.012, rainOpacity: 0.24,
  snowFall: 1.1, snowSize: 0.03, snowOpacity: 0.9, snowSway: [0.25, 1.3, 0.5], dustFall: 0.1, dustSize: 0.02, dustOpacity: 0.22, dustColour: '#b08a5a',
  dustSway: [0.6, 0.4, 0.6], swayPeriod: 60, splashSize: 0.12, splashLife: 0.35, splashOpacity: 0.32, splashRing: 0.25, lift: 0.02, keyShare: 0.3,
}
const DAY = 1200
const SKY = {
  world: {
    day: DAY,
    look: {
      dayZenith: '#2961b3', dayHorizon: '#bdd1e0', nightZenith: '#03050e', nightHorizon: '#090e1a', setZenith: '#47386b', setHorizon: '#fa7a38',
      sunHigh: '#fff2db', sunLow: '#ff6b29', moon: '#8cadff', ground: '#0a1218', exposure: 1.05, nightOpen: 0.35, sunIntensity: 2.4, moonIntensity: 0.35,
      hemiDay: 0.55, hemiNight: 0.12, stars: 1, haze: 0.00075, mist: 0.02, starSize: 0.15, twinkle: 0.4, twinkles: 900, twinkleSpread: 5, sunShrink: [0.05, 0.4],
      sunEdge: 0.85, moonEdge: 0.9, moonSize: 0.0045, radius: 8000, overcast: 0.2, envSun: 0.02, envMix: 0.05, envIntensity: 0.25,
    },
    shadow: { map: 2048, half: 60, near: 1, far: 1600, bias: -0.00002, normalBias: 0.04 },
    mods: MODS.skydome3d,
  },
  row: { t: 431.5, rate: 1, doy: 172, lat: 46, phase: 0.5 },
}
const WORLD = {
  weathers: 'weathers', soak: 6, dry: 45, lay: 55, melt: 90, gusts: [3, 7, 11], bolt: { lasts: [0.12, 0.4], out: [300, 2500] },
  look: { snowScale: 0.05, snowSharp: 0.42, flash: 0.8 }, precip: PRECIP, mods: MODS.weather3d,
}
const rowOf = (over: Partial<Weathered> = {}): Weathered => ({
  to: 'storm', from: STORM, mix: STORM, blend: 1, fade: 0, wet: 0, pack: 0, windDeg: 200, flash: 0, strike: [0, 0], drift: [0, 0], ...over,
})

const hills = (x: number, z: number) => 12 + Math.sin(x * 0.05) * 4 + Math.cos(z * 0.07) * 3
// A page: render3d, terrain3d's ground, the sky and the weather, over a sky row and a weather row,
// the scene listing `listed`.
function page(o: { row?: Partial<Weathered>; world?: Record<string, unknown>; listed?: string[] } = {}) {
  const weatherRow = { id: 4, kind: 'weather3d', data: rowOf(o.row) as Record<string, any> }
  const skyRow = { id: 3, kind: 'skydome3d', data: { ...SKY.row } as Record<string, any> }
  const plugins: any = {
    wire: {
      n: 0, rows: [skyRow, weatherRow],
      scene: {
        plugins: o.listed ?? ['terrain3d', 'skydome3d', 'weather3d', 'render3d'],
        world: { skydome3d: SKY.world, weather3d: { ...WORLD, ...o.world } },
        prefabs: { engine: { width: 320, height: 200, dt: 1 / 30 }, render3d: { camera: { fov: 62, near: 0.15, far: 9000, at: [5, 20, 7], look: [60, 15, -40] }, tone: 'neutral', shadows: 'soft' } },
      },
    },
    render3d: render3d(),
    terrain3d: { ground: { height: hills, mix: () => ({}) } as { height(x: number, z: number): number; mix(x: number, z: number): Record<string, number> } | undefined },
  }
  plugins.skydome3d = skydome3d()
  const me = weather3d()
  plugins.weather3d = me
  const frame = () => {
    plugins.render3d.tick(plugins)
    plugins.skydome3d.tick(plugins)
    me.tick(plugins)
    plugins.skydome3d.afterTick(plugins)
    me.afterTick(plugins)
  }
  return { plugins, me, weatherRow, skyRow, frame }
}
// A standard material dressed by render3d, its fragment shader as three would compile it.
const dressed = (plugins: any) => {
  const s = { vertexShader: THREE.ShaderLib.standard.vertexShader, fragmentShader: THREE.ShaderLib.standard.fragmentShader, uniforms: {} } as unknown as THREE.WebGLProgramParametersWithUniforms
  plugins.render3d.dress(new THREE.MeshStandardMaterial()).onBeforeCompile(s, undefined as unknown as THREE.WebGLRenderer)
  return s
}

test('the falling things are carried by drift and fall on the step\'s clock, the same on two clients, in counts of the weather; splashes stand on the land the mod hands, and on none, none stands', () => {
  const box = 2 * PRECIP.range
  const wrap = (x: number) => ((x % box) + box) % box
  const two = [page(), page()]
  for (const [n, drift] of [[0, [0, 0]], [450, [1234.5, -987.25]], [90001, [-40001.5, 7.75]]] as const) {
    const views = two.map(p => {
      p.weatherRow.data.drift = [...drift]
      p.plugins.wire.n = n
      p.frame()
      return p.me.fall()!
    })
    const time = n * (1 / 30)
    for (const [name, fall] of [['rain', PRECIP.rainFall], ['snow', PRECIP.snowFall], ['dust', PRECIP.dustFall]] as const) {
      const u = views[0][name].material.uniforms
      expect(u.fallTime.value).toBeLessThan(PRECIP.swayPeriod)
      expect(u.fallCarry.value.x).toBeCloseTo(wrap(drift[0]), 6)
      expect(u.fallCarry.value.y).toBeCloseTo(wrap(drift[1]), 6)
      expect(u.fallDrop.value).toBeCloseTo(wrap(time * fall), 6)
      expect(JSON.stringify(Object.values(views[1][name].material.uniforms).map(v => v.value))).toBe(JSON.stringify(Object.values(u).map(v => v.value)))
    }
    expect(views[0].rain.geometry.instanceCount).toBe(Math.round(PRECIP.rain * STORM.rain))
    expect(views[0].snow.visible).toBe(false)
    const spots = views.map(v => (v.splashes.geometry.getAttribute('spot') as THREE.InstancedBufferAttribute).array.slice())
    expect(spots[1]).toEqual(spots[0])
    const count = views[0].splashes.geometry.instanceCount
    expect(count).toBe(Math.round(PRECIP.splashes * STORM.rain))
    const cam = two[0].plugins.render3d.camera.position
    for (let i = 0; i < count; i++) {
      const [x, y, z] = spots[0].slice(i * 4, i * 4 + 3)
      expect(y).toBeCloseTo(hills(x, z) + PRECIP.lift, 4)
      expect(Math.abs(x - cam.x)).toBeLessThanOrEqual(PRECIP.range + 1e-3)
      expect(Math.abs(z - cam.z)).toBeLessThanOrEqual(PRECIP.range + 1e-3)
    }
  }
  const snowy = page({ row: { mix: SNOW } })
  snowy.frame()
  expect(snowy.me.fall()!.snow.geometry.instanceCount).toBe(Math.round(PRECIP.snow * SNOW.snow))
  // A ground that has no land yet stands no splash.
  const bare = page()
  bare.plugins.terrain3d.ground = undefined
  bare.frame()
  expect(bare.me.fall()!.splashes.visible).toBe(false)
})

test('the rain slants with the wind as it blows now on the sky\'s clock, gust and all', () => {
  const p = page()
  for (const t of [100, 431.5, 1000]) {
    p.skyRow.data.t = t
    p.frame()
    const v = wind({ ...rowOf(), ...WORLD, gusts: [3, 7, 11], t, day: DAY })
    const w = p.me.fall()!.rain.material.uniforms.fallWind.value as THREE.Vector2
    expect(w.x).toBeCloseTo(v[0], 5)
    expect(w.y).toBeCloseTo(v[1], 5)
  }
})

test('the wet and the snow go into every dressed material after the sky\'s noise, and follow the row\'s wet and pack', () => {
  const { plugins, weatherRow, frame } = page()
  frame()
  const s = dressed(plugins)
  const f = s.fragmentShader
  expect(f.indexOf('vec2 skyCloudAt(')).toBeLessThan(f.indexOf('uniform float skySnowSharp;'))
  const after = f.slice(f.indexOf('#include <normal_fragment_maps>'))
  expect(after).toMatch(/skyWet[\s\S]*skySnow/)
  weatherRow.data.wet = 0.7
  weatherRow.data.pack = 0.4
  frame()
  expect((s.uniforms as any).skyWet.value).toBe(0.7)
  expect((s.uniforms as any).skyPack.value).toBe(0.4)
})

test('weather() is the weather standing under the camera, by each biome\'s share of the land there, and a flash\'s lift while it lasts', () => {
  const biomes = { dunes: { scale: { rain: 0 }, add: { fog: 0.3 } } }
  const { me, plugins, weatherRow, frame } = page({ world: { biomes } })
  plugins.terrain3d.ground.mix = () => ({ dunes: 0.25, plain: 0.75 })
  frame()
  const now = me.weather(plugins)!
  expect(now.mix).toEqual(here(STORM, biomes, { dunes: 0.25, plain: 0.75 }))
  expect(now.mix.rain).toBeCloseTo(0.75, 12)
  expect(now.lift).toBe(0)
  weatherRow.data.flash = 0.2
  expect(me.weather(plugins)!.lift).toBe(WORLD.look.flash)
  // The sky stands in it: its key light lifted by the flash.
  const before = plugins.skydome3d.sky().key.intensity
  frame()
  expect(plugins.skydome3d.sky().key.intensity).toBeCloseTo(before + WORLD.look.flash, 9)
})

test('each part named in off is compiled out of the weather surface or not drawn, and a part it does not know throws', () => {
  const none = page({ row: { mix: { ...STORM, snow: 0.5, dust: 0.5 } }, world: { off: [...PARTS] } })
  none.frame()
  const f = dressed(none.plugins).fragmentShader
  expect(f).toContain('#define SKY_NO_WET\n')
  expect(f).toContain('#define SKY_NO_SNOWCOVER\n')
  const fall = none.me.fall()!
  for (const kind of ['rain', 'snow', 'dust', 'splashes'] as const) expect(fall[kind].visible).toBe(false)
  expect(() => page({ world: { off: ['hail' as Part] } }).frame()).toThrow('weather3d has no part hail to take off')
})

test('a scene that lists the weather before the sky it draws in throws on the first frame', () => {
  expect(() => page({ listed: ['terrain3d', 'weather3d', 'skydome3d', 'render3d'] }).frame()).toThrow('weather3d is listed before skydome3d, whose light it draws in')
})

test('close takes the falling things off the scene and disposes them', () => {
  const { me, plugins, frame } = page()
  frame()
  const fall = me.fall()!
  const disposed: string[] = []
  for (const [name, mesh] of Object.entries(fall)) mesh.material.addEventListener('dispose', () => disposed.push(name))
  me.close()
  for (const mesh of Object.values(fall)) expect(plugins.render3d.scene.children).not.toContain(mesh)
  expect(disposed.sort()).toEqual(['dust', 'rain', 'snow', 'splashes'])
  expect(me.fall()).toBeUndefined()
})
