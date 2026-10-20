// The sky's browser half on render3d, in node, drawing rows and a `world.skydome3d` this test writes,
// split from one sky as a scene splits it. Node has no WebGL, so
// the renderer is a stand-in for three's WebGLRenderer that keeps what it was made with, and three's
// PMREMGenerator a stand-in that keeps every scene it was handed, from where, and what the dome's
// uniforms held while it drew. Everything else is three's own: the lights, the fog, the materials,
// their shader chunks, and the shadow camera. The splashes stand on a terrain3d stand-in's ground,
// through terrain3d's `land` mod (`terrain3d.skydome3d.ts`), which `world.skydome3d.mods` names; the
// mod is loaded as a page loads it, by the scenemanager's `load` of a scene of the test's own that
// names it, written to a temp folder, before any page.
import { afterAll, afterEach, beforeAll, beforeEach, expect, test, vi } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import * as THREE from 'three'
import { boot, type Scene } from '#engine/engine.ts'
import { load } from '#addons/scenemanager/scenemanager.addon.ts'
import { scenemanager } from '#plugins/scenemanager/scenemanager.sim.ts'
import { render3d } from '#plugins/render3d/render3d.plugin.ts'
import { moon, moonLit, sun, wind, type Sky, type Table, type Weather } from './skydome3d.sim.ts'
import { lit, skydome3d, smooth, stale, toneMap, type Look, type Precip } from './skydome3d.plugin.ts'

type Made = { scene: THREE.Scene; sigma: number; near?: number; far?: number; position: THREE.Vector3; flash: number; rays: number; light: THREE.Color; target: { texture: THREE.Texture; disposed: boolean; dispose(): void } }
const gpu = vi.hoisted(() => ({ renderers: [] as any[], pmrems: [] as any[], made: [] as Made[] }))

vi.mock('three', async importOriginal => {
  const three = await importOriginal<typeof import('three')>()
  class WebGLRenderer {
    params: any
    target: any = null
    size = [0, 0]
    autoClear = true
    toneMapping: number = three.NoToneMapping
    toneMappingExposure = 1
    outputColorSpace = three.SRGBColorSpace
    shadowMap = { enabled: false, type: three.PCFShadowMap as number }
    clearColor = new three.Color()
    clearAlpha = 1
    state: any
    constructor(params: any) {
      this.params = params
      this.state = { buffers: { depth: { getReversed: () => !!params.reversedDepthBuffer } } }
      gpu.renderers.push(this)
    }
    setPixelRatio() {}
    getPixelRatio() { return 1 }
    setSize(w: number, h: number) { this.size = [w, h] }
    getSize(to: THREE.Vector2) { return to.set(this.size[0], this.size[1]) }
    setRenderTarget(t: any) { this.target = t }
    getRenderTarget() { return this.target }
    getClearColor(to: THREE.Color) { return to.copy(this.clearColor) }
    setClearColor(c: THREE.ColorRepresentation, a?: number) { this.clearColor.set(c); if (a !== undefined) this.clearAlpha = a }
    getClearAlpha() { return this.clearAlpha }
    setClearAlpha(a: number) { this.clearAlpha = a }
    clear() {}
    clearDepth() {}
    render() {}
    dispose() {}
    forceContextLoss() {}
  }
  class PMREMGenerator {
    renderer: any
    disposed = false
    constructor(renderer: any) { this.renderer = renderer; gpu.pmrems.push(this) }
    fromScene(scene: THREE.Scene, sigma: number, near?: number, far?: number, options: { position?: THREE.Vector3 } = {}) {
      const u = (scene.children[0] as THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>).material.uniforms
      const target = { texture: new three.Texture(), disposed: false, dispose() { this.disposed = true } }
      gpu.made.push({ scene, sigma, near, far, position: options.position!.clone(), flash: u.skyFlash.value, rays: u.skyRays.value, light: u.skyLight.value.clone(), target })
      return target
    }
    dispose() { this.disposed = true }
  }
  return { ...three, WebGLRenderer, PMREMGenerator }
})

beforeEach(() => { gpu.renderers.length = 0; gpu.pmrems.length = 0; gpu.made.length = 0 })
afterEach(() => { vi.restoreAllMocks() })

// A manager and one child, `sky`, whose `world.skydome3d.mods` names terrain3d's land: loading it
// loads the mod every page here asks for.
const dir = mkdtempSync(join(tmpdir(), 'skydome3d-plugin-'))
const path = (p: string) => JSON.stringify(new URL(p, import.meta.url).pathname)
writeFileSync(join(dir, 'sky.scene.json'), JSON.stringify({
  world: { skydome3d: { mods: { land: 'terrain3d' } } },
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
const CLEAR = weather({})
const STORM = weather({ cloud: 0.97, cirrus: 0.3, base: 450, top: 4200, dense: 3.4, rain: 1, fog: 0.42, haze: 2.8, wind: 14, gust: 0.85, thunder: 9 })
const SNOW = weather({ cloud: 0.9, base: 700, dense: 1.9, snow: 0.55, fog: 0.35, haze: 2.2, wind: 4, gust: 0.35, dust: 0.3 })

const LOOK: Look = {
  dayZenith: '#2961b3', dayHorizon: '#bdd1e0', nightZenith: '#03050e', nightHorizon: '#090e1a', setZenith: '#47386b', setHorizon: '#fa7a38',
  sunHigh: '#fff2db', sunLow: '#ff6b29', moon: '#8cadff', ground: '#0a1218', exposure: 1.05, nightOpen: 0.35, sunIntensity: 2.4, moonIntensity: 0.35,
  hemiDay: 0.55, hemiNight: 0.12, cloudScale: 0.004, cloudSharp: 0.42, cloudDrift: 0.01, cloudShadow: 0.55, godrays: 1, stars: 1, haze: 0.00075, mist: 0.02,
  cloudLit: 0.35, cloudShade: 0.55, lining: 0.8, cirrusAlpha: 0.5, starSize: 0.15, twinkle: 0.4, twinkles: 900, twinkleSpread: 5, sunShrink: [0.05, 0.4],
  sunEdge: 0.85, moonEdge: 0.9, moonSize: 0.0045, snowScale: 0.05, flash: 0.8, radius: 8000, overcast: 0.2, envSun: 0.02, envMix: 0.05, envIntensity: 0.25,
}
const PRECIP: Precip = {
  rain: 24000, snow: 18000, dust: 2600, splashes: 280, range: 26, edge: 3, near: 1.5, rainFall: 16, rainLen: 0.24, rainWidth: 0.012, rainOpacity: 0.24,
  snowFall: 1.1, snowSize: 0.03, snowOpacity: 0.9, snowSway: [0.25, 1.3, 0.5], dustFall: 0.1, dustSize: 0.02, dustOpacity: 0.22, dustColour: '#b08a5a',
  dustSway: [0.6, 0.4, 0.6], swayPeriod: 60, splashSize: 0.12, splashLife: 0.35, splashOpacity: 0.32, splashRing: 0.25, lift: 0.02, keyShare: 0.3,
}
const SHADOW = { map: 2048, half: 60, near: 1, far: 1600, bias: -0.00002, normalBias: 0.04 }
const DAY = 1200
// A sky as the browser half draws it: the row's fields and `world.skydome3d`'s in one.
const skyOf = (over: Partial<Sky> & Record<string, unknown> = {}) => ({
  t: DAY / 2, day: DAY, rate: 1, doy: 172, lat: 46, phase: 0.5, weathers: 'weathers', to: 'clear', from: CLEAR, mix: CLEAR, blend: 1, fade: 0,
  wet: 0, pack: 0, windDeg: 90, flash: 0, strike: [0, 0], drift: [0, 0], soak: 6, dry: 45, lay: 55, melt: 90, gusts: [3, 7, 11],
  bolt: { lasts: [0.12, 0.4], out: [300, 2500] }, look: LOOK, precip: PRECIP, shadow: SHADOW, mods: { land: 'terrain3d' }, ...over,
}) as Sky & Table & { look: Look; precip: Precip; shadow: typeof SHADOW; mods: { land?: string } }
type Whole = ReturnType<typeof skyOf>
// The keys of `world.skydome3d`, which no row carries.
const FIXED = ['day', 'weathers', 'soak', 'dry', 'lay', 'melt', 'gusts', 'bolt', 'look', 'precip', 'shadow', 'mods']
// A sky split as a scene carries it: its fixed numbers in `world.skydome3d`, the rest on the row.
const split = (sky: Partial<Whole>) => {
  const row: Record<string, unknown> = {}, world: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(sky)) (FIXED.includes(k) ? world : row)[k] = v
  return { row, world }
}

const hills = (x: number, z: number) => 12 + Math.sin(x * 0.05) * 4 + Math.cos(z * 0.07) * 3
// A page: render3d with a canvas when `canvas` is set, terrain3d's ground, and the sky, over one row
// and the scene's `world.skydome3d`, the scene listing `listed`, terrain3d before the sky.
function page(o: { sky?: Whole; canvas?: boolean; render?: Record<string, unknown>; listed?: string[] } = {}) {
  const at = split(o.sky ?? skyOf())
  const row = { id: 3, kind: 'skydome3d', data: at.row }
  const plugins: any = {
    wire: {
      n: 0, rows: [row],
      scene: { plugins: o.listed ?? ['terrain3d', 'skydome3d', 'render3d'], world: { skydome3d: at.world }, prefabs: { engine: { width: 320, height: 200, dt: 1 / 30 }, render3d: { camera: { fov: 62, near: 0.15, far: 9000, at: [5, 20, 7], look: [60, 15, -40] }, tone: 'aces', shadows: 'soft', ...o.render } } },
    },
    render3d: render3d(),
    terrain3d: { ground: { height: hills } },
  }
  if (o.canvas) plugins.render3d.mount({ style: {}, remove() {} })
  const me = skydome3d()
  const frame = () => {
    plugins.render3d.tick(plugins)
    me.tick(plugins)
    me.afterTick(plugins)
  }
  const set = (sky: Partial<Whole>) => {
    const to = split(sky)
    row.data = { ...row.data, ...to.row }
    plugins.wire.scene.world.skydome3d = { ...plugins.wire.scene.world.skydome3d, ...to.world }
  }
  return { plugins, me, row, frame, set }
}
const lin = (hex: string) => new THREE.Color(hex)
const close = (a: THREE.Color, b: THREE.Color, digits = 9) => {
  expect(a.r).toBeCloseTo(b.r, digits)
  expect(a.g).toBeCloseTo(b.g, digits)
  expect(a.b).toBeCloseTo(b.b, digits)
}

test('nothing is drawn and nothing is handed out before the first frame with a row', () => {
  const { me, plugins } = page()
  expect(me.light()).toBeUndefined()
  expect(me.sky()).toBeUndefined()
  plugins.wire.rows = []
  plugins.render3d.tick(plugins)
  me.tick(plugins)
  me.afterTick(plugins)
  expect(me.sky()).toBeUndefined()
  expect(plugins.render3d.scene.children).toHaveLength(0)
})

test('the dome is a BackSide sphere of the look\'s radius, 48×24, drawn first with no depth write, centred on the camera, whose shader ends in three\'s tonemapping and colorspace chunks', () => {
  const { me, plugins, frame } = page()
  frame()
  const dome = me.sky()!.dome
  const g = dome.geometry as THREE.SphereGeometry
  expect(g.parameters).toMatchObject({ radius: 8000, widthSegments: 48, heightSegments: 24 })
  expect(dome.material.side).toBe(THREE.BackSide)
  expect(dome.material.depthWrite).toBe(false)
  expect(dome.renderOrder).toBe(-1000)
  expect(dome.material.fog).toBe(false)
  const f = dome.material.fragmentShader
  expect(f.indexOf('#include <tonemapping_fragment>')).toBeGreaterThan(0)
  expect(f.indexOf('#include <colorspace_fragment>')).toBeGreaterThan(f.indexOf('#include <tonemapping_fragment>'))
  expect(dome.position.toArray()).toEqual([5, 20, 7])
  plugins.render3d.camera.position.set(-300, 45, 900)
  me.afterTick(plugins)
  expect(dome.position.toArray()).toEqual([-300, 45, 900])
})

test('the weather surface is registered once and changes the dress key', () => {
  const { me, plugins, frame } = page()
  const m = plugins.render3d.dress(new THREE.MeshStandardMaterial())
  const before = m.customProgramCacheKey()
  frame()
  expect(m.customProgramCacheKey()).not.toBe(before)
  expect(m.customProgramCacheKey()).toContain('skydome3d')
  const after = m.customProgramCacheKey()
  frame()
  frame()
  expect(m.customProgramCacheKey()).toBe(after)
  void me
})

test('the weather surface goes into a standard and a physical material\'s shaders, after the chunks it names, with the dome\'s own uniform objects', () => {
  const { me, plugins, frame } = page()
  frame()
  const u = me.sky()!.dome.material.uniforms
  for (const [lib, material] of [['standard', new THREE.MeshStandardMaterial()], ['physical', new THREE.MeshPhysicalMaterial()]] as const) {
    const m = plugins.render3d.dress(material)
    const s = { vertexShader: THREE.ShaderLib[lib].vertexShader, fragmentShader: THREE.ShaderLib[lib].fragmentShader, uniforms: {} } as unknown as THREE.WebGLProgramParametersWithUniforms
    m.onBeforeCompile(s, undefined as unknown as THREE.WebGLRenderer)
    const f = s.fragmentShader
    const after = (chunk: string) => f.slice(f.indexOf(`#include <${chunk}>`), f.indexOf(`#include <${chunk}>`) + 3000)
    expect(after('normal_fragment_maps')).toMatch(/skyWet[\s\S]*skySnow/)
    expect(after('lights_fragment_end')).toMatch(/reflectedLight\.directDiffuse \*= skyShade;[\s\S]*reflectedLight\.directSpecular \*= skyShade;/)
    expect(f).toContain('float skyCloudShadow(')
    for (const name of ['skySun', 'skyCover', 'skyBase', 'skyDrift', 'skyScale', 'skySharp', 'skyWarp', 'skyShadow', 'skyWet', 'skyPack', 'skySnowScale']) {
      expect(s.uniforms[name]).toBeDefined()
      expect(s.uniforms[name]).toBe(u[name])
    }
  }
  // A Lambert or Phong material has the chunks and no roughness: the roughness writes stand under STANDARD.
  for (const [lib, material] of [['lambert', new THREE.MeshLambertMaterial()], ['phong', new THREE.MeshPhongMaterial()]] as const) {
    const s = { vertexShader: THREE.ShaderLib[lib].vertexShader, fragmentShader: THREE.ShaderLib[lib].fragmentShader, uniforms: {} } as unknown as THREE.WebGLProgramParametersWithUniforms
    plugins.render3d.dress(material).onBeforeCompile(s, undefined as unknown as THREE.WebGLRenderer)
    expect(s.fragmentShader).not.toContain('#define STANDARD')
    for (const line of s.fragmentShader.split('\n').filter(l => l.includes('roughnessFactor ='))) {
      const before = s.fragmentShader.slice(0, s.fragmentShader.indexOf(line)).split('\n').reverse().find(l => l.trim().startsWith('#'))!
      expect(before.trim()).toBe('#ifdef STANDARD')
    }
  }
  // A frame moves the values in place, and every dressed program follows.
  const wet = u.skyWet
  plugins.wire.rows[0].data = { ...plugins.wire.rows[0].data, wet: 0.7, pack: 0.4 }
  frame()
  expect(me.sky()!.dome.material.uniforms.skyWet).toBe(wet)
  expect(wet.value).toBe(0.7)
  expect(u.skyPack.value).toBe(0.4)
})

// The palette, the lights, the fog and the exposure this row should give, from their formulas.
function expected(r: Whole, tone: 'aces' | 'neutral' | 'none' | undefined, ao: boolean) {
  const L = r.look
  const s = sun(r), m = moon(r)
  const el = Math.asin(s[1])
  const day = smooth(-0.1, 0.22, el), night = 1 - smooth(-0.16, 0.02, el), sunset = Math.exp(-((el / 0.2) ** 2))
  const dark = Math.max(0, 1 - L.overcast * r.mix.cloud * r.mix.dense)
  const zenith = lin(L.nightZenith).lerp(lin(L.dayZenith), day).lerp(lin(L.setZenith), sunset * 0.65 * day).multiplyScalar(dark)
  const horizon = lin(L.nightHorizon).lerp(lin(L.dayHorizon), day).lerp(lin(L.setHorizon), sunset * 0.85 * day).multiplyScalar(dark)
  const sunColour = lin(L.sunLow).lerp(lin(L.sunHigh), smooth(0.02, 0.4, el))
  const sunKey = (0.5 + L.sunIntensity * day) * (1 - night)
  const moonKey = L.moonIntensity * night * moonLit(r) * smooth(-0.1, 0.22, Math.asin(m[1]))
  const exposure = L.exposure * (1 + L.nightOpen * night)
  // The fog is the dome's horizon as drawn: a flash lifts it with the rest of the dome.
  const drawn = horizon.clone().addScalar(r.flash > 0 ? L.flash : 0)
  const fog = ao ? drawn : new THREE.Color().fromArray(toneMap(tone, drawn.toArray(), exposure))
  return {
    el, day, night, sunset, dark, zenith, horizon, sunColour, exposure, fog,
    key: Math.abs(sunKey - moonKey) * dark + (r.flash > 0 ? L.flash : 0),
    body: sunKey >= moonKey ? s : m,
    keyColour: sunKey >= moonKey ? sunColour : lin(L.moon),
    hemi: (L.hemiNight + L.hemiDay * day) * dark,
    ground: lin(L.ground).multiplyScalar(dark),
    density: L.haze * (0.6 + r.mix.haze * 0.5) + r.mix.fog * L.mist,
  }
}

test('the palette, the key light, the hemisphere light, the fog and the exposure follow their formulas through a day, clear and in a storm, with and without ao', () => {
  for (const [render, ao] of [[{ tone: 'aces' }, false], [{ tone: 'neutral' }, false], [{ tone: 'none' }, false], [{ tone: 'aces', ao: { on: true, radius: 1, thickness: 1, falloff: 1, scale: 1, intensity: 1, samples: 8 } }, true]] as const) {
    for (const mix of [CLEAR, STORM]) {
      const { me, plugins, frame, set } = page({ canvas: true, render })
      for (let k = 0; k < 24; k++) {
        const r = skyOf({ t: (k / 24) * DAY + 7, mix, flash: k === 5 ? 0.2 : 0 })
        set(r)
        frame()
        const e = expected(r, render.tone, ao)
        const got = me.sky()!
        for (const f of ['el', 'day', 'night', 'sunset', 'dark'] as const) expect(got[f]).toBeCloseTo(e[f], 12)
        close(got.zenith, e.zenith)
        close(got.horizon, e.horizon)
        close(got.sunColour, e.sunColour)
        close(got.dome.material.uniforms.skyZenith.value, e.zenith)
        const key = got.key
        expect(key.intensity).toBeCloseTo(e.key, 9)
        close(key.color, e.keyColour)
        const dir = key.position.clone().sub(key.target.position).normalize()
        dir.toArray().forEach((v, i) => expect(v).toBeCloseTo(e.body[i], 9))
        expect(got.hemi.intensity).toBeCloseTo(e.hemi, 9)
        close(got.hemi.color, e.horizon)
        close(got.hemi.groundColor, e.ground)
        expect(plugins.render3d.scene.fog).toBe(got.fog)
        expect(got.fog.density).toBeCloseTo(e.density, 12)
        close(got.fog.color, e.fog)
        expect(plugins.render3d.renderer.toneMappingExposure).toBeCloseTo(e.exposure, 12)
        const light = me.light()!
        close(light.horizon, e.horizon)
        expect(light.fog).toBe(got.fog)
        // The key light and the hemisphere light as numbers, for what is lit apart from the scene.
        light.key.toArray().forEach((v, i) => expect(v).toBeCloseTo(e.body[i], 9))
        close(light.keyColor, e.keyColour.clone().multiplyScalar(e.key))
        close(light.sky, e.horizon.clone().multiplyScalar(e.hemi))
        close(light.ground, e.ground.clone().multiplyScalar(e.hemi))
      }
    }
  }
})

test('the key light goes through 0 as it changes body, and nothing jumps at midnight', () => {
  const { me, frame, set } = page()
  const at = (t: number) => {
    set(skyOf({ t, phase: 0.5 }))
    frame()
    const k = me.sky()!.key
    return { i: k.intensity, body: me.sky()!.body, zenith: me.sky()!.zenith.clone(), dir: k.position.clone().sub(k.target.position).normalize() }
  }
  let was = at(0), changes = 0
  for (let n = 1; n <= 4000; n++) {
    const now = at((n / 4000) * DAY)
    expect(Math.abs(now.i - was.i)).toBeLessThan(0.03)
    if (now.body !== was.body) {
      changes++
      expect(Math.max(now.i, was.i)).toBeLessThan(0.03)
    }
    was = now
  }
  // Full moon: the moon takes over at dusk and hands back at dawn.
  expect(changes).toBe(2)
  const before = at(DAY - 1e-6), after = at(0)
  expect(Math.abs(before.i - after.i)).toBeLessThan(1e-6)
  expect(before.dir.distanceTo(after.dir)).toBeLessThan(1e-6)
  expect(Math.abs(before.zenith.r - after.zenith.r)).toBeLessThan(1e-9)
})

test('toneMap is three\'s curve: the constants it uses are the ones in three\'s tonemapping chunk, and none leaves a colour as it is', () => {
  const chunk = THREE.ShaderChunk.tonemapping_pars_fragment
  for (const text of [
    'vec3( 0.59719, 0.07600, 0.02840 )', 'vec3( 0.35458, 0.90834, 0.13383 )', 'vec3( 0.04823, 0.01566, 0.83777 )',
    'vec3(  1.60475, -0.10208, -0.00327 )', 'vec3( -0.53108,  1.10813, -0.07276 )', 'vec3( -0.07367, -0.00605,  1.07602 )',
    'vec3 a = v * ( v + 0.0245786 ) - 0.000090537;', 'vec3 b = v * ( 0.983729 * v + 0.4329510 ) + 0.238081;', 'color *= toneMappingExposure / 0.6;',
    'const float StartCompression = 0.8 - 0.04;', 'const float Desaturation = 0.15;', 'float offset = x < 0.08 ? x - 6.25 * x * x : 0.04;',
  ]) expect(chunk).toContain(text)
  expect(toneMap('none', [0.3, 2, 0.01], 1.7)).toEqual([0.3, 2, 0.01])
  expect(toneMap(undefined, [0.3, 2, 0.01], 1.7)).toEqual([0.3, 2, 0.01])
  // ACES of grey 0.18 at an exposure of 1, worked by hand from the chunk: 0.18/0.6 = 0.3 through the
  // input matrix, whose rows each sum to 1, the fit, and the output matrix, whose rows sum to 1.
  const v = 0.3, fit = (v * (v + 0.0245786) - 0.000090537) / (v * (0.983729 * v + 0.432951) + 0.238081)
  toneMap('aces', [0.18, 0.18, 0.18], 1).forEach(c => expect(c).toBeCloseTo(fit, 4))
  // Neutral below the knee is the colour less its offset.
  toneMap('neutral', [0.2, 0.3, 0.4], 1).forEach((c, i) => expect(c).toBeCloseTo([0.2, 0.3, 0.4][i] - 0.04, 12))
  // A darkest channel under 0.08 is offset by x − 6.25x².
  expect(toneMap('neutral', [0.03, 0.1, 0.2], 2)[0]).toBeCloseTo(0.06 - (0.06 - 6.25 * 0.06 ** 2), 12)
})

test('the shadow box stands on the texel lattice across the light, within half a texel of the camera, the light far/2 out, casting through dawn', () => {
  const { me, plugins, frame, set } = page()
  const texel = (2 * SHADOW.half) / SHADOW.map
  for (let k = 0; k < 40; k++) {
    set(skyOf({ t: DAY * (0.28 + k * 0.011) }))
    const cam = new THREE.Vector3(Math.sin(k * 12.9898) * 3000, 30 + k, Math.cos(k * 78.233) * 3000)
    plugins.render3d.tick(plugins)
    plugins.render3d.camera.position.copy(cam)
    me.tick(plugins)
    me.afterTick(plugins)
    const key = me.sky()!.key
    expect(key.castShadow).toBe(true)
    const c = key.target.position
    const basis = new THREE.Matrix4().lookAt(key.position, c, key.shadow.camera.up)
    const X = new THREE.Vector3(), Y = new THREE.Vector3(), Z = new THREE.Vector3()
    basis.extractBasis(X, Y, Z)
    for (const axis of [X, Y]) {
      const units = c.dot(axis) / texel
      expect(Math.abs(units - Math.round(units))).toBeLessThan(1e-6)
      expect(Math.abs(c.clone().sub(cam).dot(axis))).toBeLessThanOrEqual(texel / 2 + 1e-9)
    }
    expect(Math.abs(c.clone().sub(cam).dot(Z))).toBeLessThan(1e-6)
    expect(key.position.distanceTo(c)).toBeCloseTo(SHADOW.far / 2, 6)
    const sc = key.shadow.camera
    expect([sc.left, sc.right, sc.top, sc.bottom, sc.near, sc.far]).toEqual([-SHADOW.half, SHADOW.half, SHADOW.half, -SHADOW.half, SHADOW.near, SHADOW.far])
    expect(key.shadow.mapSize.toArray()).toEqual([SHADOW.map, SHADOW.map])
    expect(key.shadow.normalBias).toBe(SHADOW.normalBias)
  }
  // Before sunrise the key's intensity is 0 on a new moon, and it still casts.
  set(skyOf({ t: DAY * 0.02, phase: 0 }))
  frame()
  expect(me.sky()!.key.intensity).toBe(0)
  expect(me.sky()!.key.castShadow).toBe(true)
})

test('the key light\'s bias is turned over only for reversed depth with a PCF map, whose chunk adds the bias with no reversed branch', () => {
  const chunk = THREE.ShaderChunk.shadowmap_pars_fragment
  // The directional light's PCF path, then its VSM and basic paths, up to the point light's.
  const pcf = chunk.slice(chunk.indexOf('float getShadow( sampler2DShadow'), chunk.indexOf('#elif defined( SHADOWMAP_TYPE_VSM )'))
  expect(pcf.length).toBeGreaterThan(100)
  expect(pcf).toContain('shadowCoord.z += shadowBias;')
  expect(pcf).not.toContain('USE_REVERSED_DEPTH_BUFFER')
  const rest = chunk.slice(chunk.indexOf('#elif defined( SHADOWMAP_TYPE_VSM )'), chunk.indexOf('float getPointShadow('))
  expect(rest.match(/#ifdef USE_REVERSED_DEPTH_BUFFER\s+shadowCoord\.z -= shadowBias;/g)?.length).toBe(2)
  const ao = { on: true, radius: 1, thickness: 1, falloff: 1, scale: 1, intensity: 1, samples: 8 }
  const bias =(render: Record<string, unknown>) => {
    const { me, frame } = page({ canvas: true, render })
    frame()
    return me.sky()!.key.shadow.bias
  }
  expect(bias({ shadows: 'soft', ao })).toBe(-SHADOW.bias)
  expect(bias({ shadows: 'hard', ao })).toBe(SHADOW.bias)
  expect(bias({ shadows: 'soft' })).toBe(SHADOW.bias)
  // With no renderer yet there is no depth to turn it over for.
  const bare = page({ render: { shadows: 'soft', ao } })
  bare.frame()
  expect(bare.me.sky()!.key.shadow.bias).toBe(SHADOW.bias)
})

test('the falling things are carried by drift and fall on the step\'s clock, the same on two clients, in counts of the weather; splashes stand on the land the mod hands, and on none, none stands', () => {
  const box = 2 * PRECIP.range
  const wrap = (x: number) => ((x % box) + box) % box
  const two = [page(), page()]
  for (const [n, drift] of [[0, [0, 0]], [450, [1234.5, -987.25]], [90001, [-40001.5, 7.75]]] as const) {
    const views = two.map(p => {
      p.set(skyOf({ mix: STORM, drift: [...drift] as [number, number], windDeg: 200 }))
      p.plugins.wire.n = n
      p.frame()
      return p.me.sky()!.fall
    })
    const time = n * (1 / 30)
    for (const [name, fall] of [['rain', PRECIP.rainFall], ['snow', PRECIP.snowFall], ['dust', PRECIP.dustFall]] as const) {
      const u = views[0][name].material.uniforms
      // The sway clock is the step's clock wrapped by the sway period in doubles, so it stays small
      // in a float however long the game runs.
      expect(u.fallTime.value).toBeCloseTo(((time % PRECIP.swayPeriod) + PRECIP.swayPeriod) % PRECIP.swayPeriod, 9)
      expect(u.fallTime.value).toBeLessThan(PRECIP.swayPeriod)
      expect(u.fallPeriod.value).toBe(PRECIP.swayPeriod)
      expect(u.fallCarry.value.x).toBeCloseTo(wrap(drift[0]), 6)
      expect(u.fallCarry.value.y).toBeCloseTo(wrap(drift[1]), 6)
      expect(u.fallDrop.value).toBeCloseTo(wrap(time * fall), 6)
      expect(JSON.stringify(Object.fromEntries(Object.entries(views[1][name].material.uniforms).map(([k, v]) => [k, (v as THREE.IUniform).value])))).toBe(JSON.stringify(Object.fromEntries(Object.entries(u).map(([k, v]) => [k, (v as THREE.IUniform).value]))))
      expect(views[0][name].material.side).toBe(THREE.DoubleSide)
    }
    expect((views[0].rain.geometry as THREE.InstancedBufferGeometry).instanceCount).toBe(Math.round(PRECIP.rain * STORM.rain))
    expect((views[0].snow.geometry as THREE.InstancedBufferGeometry).instanceCount).toBe(0)
    expect(views[0].snow.visible).toBe(false)
    expect((views[0].dust.geometry as THREE.InstancedBufferGeometry).instanceCount).toBe(Math.round(PRECIP.dust * STORM.dust))
    const spots = views.map(v => (v.splashes.geometry.getAttribute('spot') as THREE.InstancedBufferAttribute).array.slice())
    expect(spots[1]).toEqual(spots[0])
    const count = (views[0].splashes.geometry as THREE.InstancedBufferGeometry).instanceCount
    expect(count).toBe(Math.round(PRECIP.splashes * STORM.rain))
    const cam = two[0].plugins.render3d.camera.position
    for (let i = 0; i < count; i++) {
      const [x, y, z, age] = spots[0].slice(i * 4, i * 4 + 4)
      expect(y).toBeCloseTo(hills(x, z) + PRECIP.lift, 4)
      expect(Math.abs(x - cam.x)).toBeLessThanOrEqual(PRECIP.range + 1e-3)
      expect(Math.abs(z - cam.z)).toBeLessThanOrEqual(PRECIP.range + 1e-3)
      expect(age).toBeGreaterThanOrEqual(0)
      expect(age).toBeLessThan(1)
    }
  }
  // The rain slants with the wind as it blows now, gust and all: the sim's `wind` of the row.
  for (const t of [100, 431.5, 1000]) {
    const r = skyOf({ mix: STORM, windDeg: 200, t })
    two[0].set(r)
    two[0].frame()
    const v = wind(r)
    const w = two[0].me.sky()!.fall.rain.material.uniforms.fallWind.value as THREE.Vector2
    expect(w.x).toBeCloseTo(v[0], 5)
    expect(w.y).toBeCloseTo(v[1], 5)
    expect(Math.hypot(w.x, w.y)).toBeGreaterThan(STORM.wind * (1 - 0.45 * STORM.gust) - 1e-9)
  }
  const snowy = page({ sky: skyOf({ mix: SNOW }) })
  snowy.frame()
  const f = snowy.me.sky()!.fall
  expect((f.snow.geometry as THREE.InstancedBufferGeometry).instanceCount).toBe(Math.round(PRECIP.snow * SNOW.snow))
  expect(f.splashes.visible).toBe(false)
  // A ground that has no land yet stands no splash.
  const bare = page({ sky: skyOf({ mix: STORM }) })
  bare.plugins.terrain3d.ground = undefined
  bare.frame()
  expect(bare.me.sky()!.fall.splashes.visible).toBe(false)
  expect((bare.me.sky()!.fall.splashes.geometry as THREE.InstancedBufferGeometry).instanceCount).toBe(0)
  // A scene that names no land stands none, whatever terrain3d has, in whatever order it is listed.
  const unnamed = page({ sky: skyOf({ mix: STORM, mods: {} }), listed: ['skydome3d', 'render3d'] })
  unnamed.frame()
  expect(unnamed.me.sky()!.fall.splashes.visible).toBe(false)
  expect((unnamed.me.sky()!.fall.splashes.geometry as THREE.InstancedBufferGeometry).instanceCount).toBe(0)
  expect((unnamed.me.sky()!.fall.rain.geometry as THREE.InstancedBufferGeometry).instanceCount).toBe(Math.round(PRECIP.rain * STORM.rain))
})

test('a scene whose land the sky reads is a plugin listed after it, or one it does not list, throws on the first frame', () => {
  expect(() => page({ listed: ['skydome3d', 'terrain3d', 'render3d'] }).frame()).toThrow('skydome3d is listed before terrain3d, whose land it reads that frame')
  expect(() => page({ listed: ['skydome3d', 'render3d'] }).frame()).toThrow('skydome3d\'s land is terrain3d\'s, which this scene does not list')
})

test('a flake\'s sway rates are whole cycles of swayPeriod, so its sway on the wrapped clock is its sway on the step\'s clock, long into a game', () => {
  const { me, frame } = page({ sky: skyOf({ mix: SNOW }) })
  frame()
  const v = me.sky()!.fall.snow.material.vertexShader
  expect(v).toContain('float turn = 6.28318530718 / fallPeriod;')
  expect(v).toContain('float r1 = turn * max( 1.0, floor( fallSway.y * ( 1.0 + fallSway.z * ( skyDrop( id, 3u ) - 0.5 ) ) / turn + 0.5 ) );')
  expect(v).toContain('float r2 = turn * max( 1.0, floor( fallSway.y * ( 1.0 - fallSway.z * ( skyDrop( id, 4u ) - 0.5 ) ) / turn + 0.5 ) );')
  expect(v).toContain('p.x += fallSway.x * sin( r1 * fallTime')
  expect(v).toContain('p.z += fallSway.x * sin( r2 * fallTime')
  // The shader's rates in doubles, r1 spread up and r2 down, for hashes across [0, 1): the wrapped
  // clock, as a float would hold it, gives the phase the whole clock gives.
  const [, rate, spread] = PRECIP.snowSway, P = PRECIP.swayPeriod, turn = (2 * Math.PI) / P
  for (const sign of [1, -1]) for (const h of [0, 0.13, 0.5, 0.77, 0.999]) {
    const r = turn * Math.max(1, Math.floor((rate * (1 + sign * spread * (h - 0.5))) / turn + 0.5))
    expect(Math.abs(r - rate * (1 + sign * spread * (h - 0.5)))).toBeLessThanOrEqual(turn / 2)
    for (const t of [12.5, 86400 * 3 + 0.37, 1e7 + 0.1]) {
      const wrapped = Math.fround(((t % P) + P) % P)
      expect(Math.sin(r * wrapped)).toBeCloseTo(Math.sin(r * t), 5)
    }
  }
})

test('stale: none yet, a new `to`, `from` or look, the sun turned past envSun, or s moved past envMix; never drift, the camera, a flash or wet', () => {
  const r = skyOf()
  const then = lit(r)
  expect(stale(LOOK, undefined, then)).toBe(true)
  expect(stale(LOOK, then, lit(skyOf()))).toBe(false)
  expect(stale(LOOK, then, lit(skyOf({ drift: [900, 12], flash: 0.3, wet: 0.8, pack: 0.5, windDeg: 10 })))).toBe(false)
  expect(stale(LOOK, then, lit(skyOf({ to: 'storm' })))).toBe(true)
  expect(stale(LOOK, then, lit(skyOf({ from: STORM })))).toBe(true)
  expect(stale(LOOK, then, lit(skyOf({ look: { ...LOOK, cloudLit: 0.4 } })))).toBe(true)
  // The sun turns 2π a day at the equinox on the equator: envSun 0.02 rad is 0.02/2π of a day.
  const eq = { lat: 0, doy: 80.5 }
  const a = lit(skyOf({ ...eq, t: 300 }))
  expect(stale(LOOK, a, lit(skyOf({ ...eq, t: 300 + (0.019 / (2 * Math.PI)) * DAY })))).toBe(false)
  expect(stale(LOOK, a, lit(skyOf({ ...eq, t: 300 + (0.021 / (2 * Math.PI)) * DAY })))).toBe(true)
  // s is the smoothstep of blend: at 0.5 its slope is 1.5.
  const b = lit(skyOf({ blend: 0.5, fade: 10 }))
  expect(b.s).toBe(0.5)
  expect(stale(LOOK, b, lit(skyOf({ blend: 0.5 + 0.049 / 1.5, fade: 10 })))).toBe(false)
  expect(stale(LOOK, b, lit(skyOf({ blend: 0.5 + 0.051 / 1.5, fade: 10 })))).toBe(true)
})

test('the environment is the dome alone at a metre, from the camera, made on the first frame with a renderer and again only when stale, drawn without a flash, lit at envIntensity; close lets it go', () => {
  const noRenderer = page()
  noRenderer.frame()
  expect(gpu.made).toHaveLength(0)

  const { me, plugins, frame, set } = page({ canvas: true })
  const scene: THREE.Scene = plugins.render3d.scene
  frame()
  expect(gpu.pmrems).toHaveLength(1)
  expect(gpu.pmrems[0].renderer).toBe(plugins.render3d.renderer)
  expect(gpu.made).toHaveLength(1)
  const first = gpu.made[0]
  const dome = me.sky()!.dome
  expect(first.scene.children).toHaveLength(1)
  const env = first.scene.children[0] as THREE.Mesh
  expect(env.geometry).toBe(dome.geometry)
  expect(env.material).toBe(dome.material)
  expect(env.scale.toArray()).toEqual([1 / 8000, 1 / 8000, 1 / 8000])
  expect(env.position.toArray()).toEqual([5, 20, 7])
  expect(first.position.toArray()).toEqual([5, 20, 7])
  expect([first.sigma, first.near, first.far]).toEqual([0, undefined, undefined])
  expect(scene.environment).toBe(first.target.texture)
  expect(scene.environmentIntensity).toBe(0.25)

  // Drift, the camera, a flash and wet make none.
  plugins.render3d.camera.position.set(400, 60, -800)
  set({ drift: [500, 90], wet: 0.6, flash: 0.3, t: DAY / 2 + 0.01 })
  frame()
  expect(gpu.made).toHaveLength(1)
  const u = dome.material.uniforms
  expect(u.skyFlash.value).toBe(LOOK.flash)
  const rays = u.skyRays.value

  // A new fade makes one, from where the camera stands now, without the flash, the one before let go.
  set({ to: 'storm', from: STORM, blend: 0, fade: 10 })
  frame()
  expect(gpu.made).toHaveLength(2)
  const second = gpu.made[1]
  expect(second.position.toArray()).toEqual([400, 60, -800])
  expect(second.flash).toBe(0)
  expect(second.rays).toBeCloseTo(rays - LOOK.godrays * LOOK.flash * (1 - 0.6 * me.sky()!.night), 9)
  // The deck and cirrus are lit by the key light less the flash, and the flashed light is put back.
  const key = me.sky()!.key
  close(second.light, key.color.clone().multiplyScalar(key.intensity - LOOK.flash))
  close(u.skyLight.value, key.color.clone().multiplyScalar(key.intensity))
  expect(key.intensity - LOOK.flash).toBeGreaterThan(0)
  expect(u.skyFlash.value).toBe(LOOK.flash)
  expect(u.skyRays.value).toBe(rays)
  expect(first.target.disposed).toBe(true)
  expect(second.target.disposed).toBe(false)
  expect(scene.environment).toBe(second.target.texture)

  // The sun turning by less than envSun makes none; past it, one.
  set({ t: DAY / 2 + 0.01 + (0.01 / (2 * Math.PI)) * DAY })
  frame()
  expect(gpu.made).toHaveLength(2)
  set({ t: DAY / 2 + 0.01 + (0.05 / (2 * Math.PI)) * DAY })
  frame()
  expect(gpu.made).toHaveLength(3)
  // A new look makes one, lit at its envIntensity.
  set({ look: { ...LOOK, envIntensity: 0.4 } })
  frame()
  expect(gpu.made).toHaveLength(4)
  expect(scene.environmentIntensity).toBe(0.4)
  expect(gpu.pmrems).toHaveLength(1)

  me.close()
  expect(gpu.made[3].target.disposed).toBe(true)
  expect(gpu.pmrems[0].disposed).toBe(true)
  expect(scene.environment).toBeNull()
  expect(scene.environmentIntensity).toBe(1)
})

test('close takes the dome, the lights, the fog and the falling things off the scene and disposes them', () => {
  const { me, plugins, frame } = page({ canvas: true })
  frame()
  const scene: THREE.Scene = plugins.render3d.scene
  const got = me.sky()!
  const disposed: string[] = []
  for (const [name, mesh] of [['dome', got.dome], ...Object.entries(got.fall)] as [string, THREE.Mesh][]) {
    mesh.geometry.addEventListener('dispose', () => disposed.push(`${name} geometry`))
    ;(mesh.material as THREE.Material).addEventListener('dispose', () => disposed.push(`${name} material`))
  }
  expect(scene.children.length).toBeGreaterThan(0)
  me.close()
  expect(scene.children).toHaveLength(0)
  expect(scene.fog).toBeNull()
  expect(disposed.sort()).toEqual(['dome', 'dust', 'rain', 'snow', 'splashes'].flatMap(n => [`${n} geometry`, `${n} material`]).sort())
  expect(me.light()).toBeUndefined()
  expect(me.sky()).toBeUndefined()
})
