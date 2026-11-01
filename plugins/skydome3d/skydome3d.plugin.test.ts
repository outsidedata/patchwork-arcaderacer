// The sky's browser half on render3d, in node, drawing a row and a `world.skydome3d` this test writes,
// split from one sky as a scene splits it. Node has no WebGL, so the renderer is a stand-in for three's
// WebGLRenderer that keeps what it was made with, and three's PMREMGenerator a stand-in that keeps every
// scene it was handed, from where, and what the dome's uniforms held while it drew. Everything else is
// three's own: the lights, the fog, the materials, their shader chunks, and the shadow camera. The
// weather comes through weather3d's `weather` mod (`weather3d.skydome3d.ts`), from a weather3d
// stand-in whose `weather()` the test sets, and the land is terrain3d's `land` mod
// (`terrain3d.skydome3d.ts`); both are loaded as a page loads them, by the scenemanager's `load` of a
// scene of the test's own that names them, written to a temp folder, before any page.
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
import type { Weather } from '#plugins/weather3d/weather3d.sim.ts'
import type { Sky, Table } from './skydome3d.sim.ts'
import { lit, PARTS, skydome3d, stale, toneMap, type Look, type Part, type Standing } from './skydome3d.plugin.ts'

type Made = { scene: THREE.Scene; sigma: number; near?: number; far?: number; position: THREE.Vector3; flash: number; light: THREE.Color; target: { texture: THREE.Texture; disposed: boolean; dispose(): void } }
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
      gpu.made.push({ scene, sigma, near, far, position: options.position!.clone(), flash: u.skyFlash.value, light: u.skyLight.value.clone(), target })
      return target
    }
    dispose() { this.disposed = true }
  }
  return { ...three, WebGLRenderer, PMREMGenerator }
})

beforeEach(() => { gpu.renderers.length = 0; gpu.pmrems.length = 0; gpu.made.length = 0 })
afterEach(() => { vi.restoreAllMocks() })

// A manager and one child, `sky`, whose `world.skydome3d.mods` names terrain3d's land and weather3d's
// weather: loading it loads the mods every page here asks for.
const dir = mkdtempSync(join(tmpdir(), 'skydome3d-plugin-'))
const path = (p: string) => JSON.stringify(new URL(p, import.meta.url).pathname)
writeFileSync(join(dir, 'sky.scene.json'), JSON.stringify({
  world: { skydome3d: { mods: { land: 'terrain3d', weather: 'weather3d' } } },
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
// The weather the weather3d stand-in hands the sky.
const standing = (over: Partial<Standing> = {}): Standing => ({ mix: CLEAR, lift: 0, to: 'clear', from: CLEAR, blend: 1, shares: {}, ...over })

const LOOK: Look = {
  dayZenith: '#2961b3', dayHorizon: '#bdd1e0', nightZenith: '#03050e', nightHorizon: '#090e1a', setZenith: '#47386b', setHorizon: '#fa7a38',
  sunHigh: '#fff2db', sunLow: '#ff6b29', moon: '#8cadff', ground: '#0a1218', exposure: 1.05, nightOpen: 0.35, sunIntensity: 2.4, moonIntensity: 0.35,
  hemiDay: 0.55, hemiNight: 0.12, stars: 1, haze: 0.00075, mist: 0.02, starSize: 0.15, twinkle: 0.4, twinkles: 900, twinkleSpread: 5, sunShrink: [0.05, 0.4],
  sunEdge: 0.85, moonEdge: 0.9, moonSize: 0.0045, radius: 8000, overcast: 0.2, envSun: 0.02, envMix: 0.05, envIntensity: 0.25,
}
const SHADOW = { map: 2048, half: 60, near: 1, far: 1600, bias: -0.00002, normalBias: 0.04 }
const DAY = 1200
// A sky as the browser half draws it: the row's fields and `world.skydome3d`'s in one.
type Whole = Sky & Table & { look: Look; shadow: typeof SHADOW; mods: Record<string, string>; off?: Part[] }
const skyOf = (over: Partial<Whole> = {}): Whole => ({
  t: DAY / 2, day: DAY, rate: 1, doy: 172, lat: 46, phase: 0.5, look: LOOK, shadow: SHADOW, mods: { land: 'terrain3d', weather: 'weather3d' }, ...over,
})
// The keys of `world.skydome3d`, which no row carries.
const FIXED = ['day', 'look', 'shadow', 'mods', 'off']
// A sky split as a scene carries it: its fixed numbers in `world.skydome3d`, the rest on the row.
const split = (sky: Partial<Whole>) => {
  const row: Record<string, unknown> = {}, world: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(sky)) (FIXED.includes(k) ? world : row)[k] = v
  return { row, world }
}

// A page: render3d with a canvas when `canvas` is set, terrain3d's ground, a weather3d whose
// `weather()` hands `now`, and the sky, over one row and the scene's `world.skydome3d`, the scene
// listing `listed`.
function page(o: { sky?: Whole; canvas?: boolean; render?: Record<string, unknown>; listed?: string[] } = {}) {
  const at = split(o.sky ?? skyOf())
  const row = { id: 3, kind: 'skydome3d', data: at.row }
  const now = { weather: standing() as Standing | undefined }
  const plugins: any = {
    wire: {
      n: 0, rows: [row],
      scene: { plugins: o.listed ?? ['terrain3d', 'skydome3d', 'weather3d', 'render3d'], world: { skydome3d: at.world }, prefabs: { engine: { width: 320, height: 200, dt: 1 / 30 }, render3d: { camera: { fov: 62, near: 0.15, far: 9000, at: [5, 20, 7], look: [60, 15, -40] }, tone: 'neutral', shadows: 'soft', ...o.render } } },
    },
    render3d: render3d(),
    terrain3d: { ground: { height: () => 0 } },
    weather3d: { weather: () => now.weather },
  }
  if (o.canvas) plugins.render3d.mount({ style: {}, remove() {} })
  const me = skydome3d()
  plugins.skydome3d = me
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
  return { plugins, me, row, frame, set, now }
}

test('nothing is drawn and nothing is handed out before the first frame with a row', () => {
  const { me, plugins } = page()
  plugins.wire.rows = []
  plugins.render3d.tick(plugins)
  me.tick(plugins)
  me.afterTick(plugins)
  expect(me.light()).toBeUndefined()
  expect(me.sky()).toBeUndefined()
  expect(plugins.render3d.scene.children).toHaveLength(0)
})

test('the dome stands round the camera wherever it goes', () => {
  const { me, plugins, frame } = page()
  frame()
  const dome = me.sky()!.dome
  expect(dome.position.toArray()).toEqual([5, 20, 7])
  plugins.render3d.camera.position.set(-300, 45, 900)
  me.afterTick(plugins)
  expect(dome.position.toArray()).toEqual([-300, 45, 900])
})

test('a splice handed to the dome before or after it is built goes into its shader, with its uniforms beside the dome\'s own', () => {
  const { me, plugins, frame } = page()
  const early = { value: 0.25 }, late = { value: 0.5 }
  me.dome('early', { uniforms: { early }, common: 'uniform float early;', main: 'sky += vec3( early );' })
  frame()
  const material = me.sky()!.dome.material
  expect(material.fragmentShader).toContain('sky += vec3( early );')
  expect(material.uniforms.early).toBe(early)
  const version = material.version
  me.dome('late', { uniforms: { late }, common: 'uniform float late;', main: 'sky *= late;' })
  expect(material.fragmentShader).toMatch(/sky \+= vec3\( early \);[\s\S]*sky \*= late;[\s\S]*skyFlash/)
  expect(material.uniforms.late).toBe(late)
  expect(material.version).toBeGreaterThan(version)
  expect(() => me.dome('late', {})).toThrow('skydome3d already has the dome splice late')
  void plugins
})

test('each part named in off is compiled out of the dome or not drawn, and a part it does not know throws', () => {
  const all = page({ canvas: true })
  all.frame()
  expect(all.me.sky()!.dome.visible).toBe(true)
  expect(all.plugins.render3d.scene.fog).toBe(all.me.sky()!.fog)
  expect(all.me.sky()!.key.castShadow).toBe(true)
  expect(all.plugins.render3d.scene.environment).not.toBeNull()

  const none = page({ canvas: true, sky: skyOf({ off: [...PARTS] }) })
  none.frame()
  const got = none.me.sky()!
  for (const part of ['gradient', 'stars', 'moon', 'sun', 'flash']) expect(got.dome.material.defines).toHaveProperty(`SKY_NO_${part.toUpperCase()}`)
  expect(got.dome.visible).toBe(false)
  expect(none.plugins.render3d.scene.fog).toBeNull()
  expect(got.key.castShadow).toBe(false)
  expect(none.plugins.render3d.scene.environment).toBeNull()

  expect(() => page({ sky: skyOf({ off: ['clouds' as Part] }) }).frame()).toThrow('skydome3d has no part clouds to take off')
})

test('the weather the mod hands darkens the sky and its lights under cloud, thickens the fog, and a flash lifts the key light and the dome; with no mod named the sky stands in none', () => {
  const clear = page()
  clear.frame()
  const c = clear.me.sky()!
  const zenith = c.zenith.clone(), key = c.key.intensity, hemi = c.hemi.intensity, density = c.fog.density

  const storm = page()
  storm.now.weather = standing({ mix: STORM, to: 'storm', from: STORM })
  storm.frame()
  const s = storm.me.sky()!
  expect(s.zenith.r + s.zenith.g + s.zenith.b).toBeLessThan(zenith.r + zenith.g + zenith.b)
  expect(s.key.intensity).toBeLessThan(key)
  expect(s.hemi.intensity).toBeLessThan(hemi)
  expect(s.fog.density).toBeGreaterThan(density)

  const steady = s.key.intensity
  storm.now.weather = standing({ mix: STORM, to: 'storm', from: STORM, lift: 0.8 })
  storm.frame()
  expect(storm.me.sky()!.key.intensity).toBeCloseTo(steady + 0.8, 9)
  expect(storm.me.sky()!.uniforms.skyFlash.value).toBe(0.8)

  // With no weather named, the sky is the same as one standing in no weather at all.
  const unnamed = page({ sky: skyOf({ mods: { land: 'terrain3d' } }), listed: ['terrain3d', 'skydome3d', 'render3d'] })
  unnamed.frame()
  const nothing = page()
  nothing.now.weather = undefined
  nothing.frame()
  expect(unnamed.me.sky()!.key.intensity).toBe(nothing.me.sky()!.key.intensity)
  expect(unnamed.me.sky()!.fog.density).toBe(nothing.me.sky()!.fog.density)
  expect(nothing.me.sky()!.fog.density).toBeCloseTo(LOOK.haze * 0.6, 12)
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

test('toneMap is three\'s curve: the constants it uses are the ones in three\'s tonemapping chunk', () => {
  const chunk = THREE.ShaderChunk.tonemapping_pars_fragment
  for (const text of [
    'vec3( 0.59719, 0.07600, 0.02840 )', 'vec3( 0.35458, 0.90834, 0.13383 )', 'vec3( 0.04823, 0.01566, 0.83777 )',
    'vec3(  1.60475, -0.10208, -0.00327 )', 'vec3( -0.53108,  1.10813, -0.07276 )', 'vec3( -0.07367, -0.00605,  1.07602 )',
    'vec3 a = v * ( v + 0.0245786 ) - 0.000090537;', 'vec3 b = v * ( 0.983729 * v + 0.4329510 ) + 0.238081;', 'color *= toneMappingExposure / 0.6;',
    'const float StartCompression = 0.8 - 0.04;', 'const float Desaturation = 0.15;', 'float offset = x < 0.08 ? x - 6.25 * x * x : 0.04;',
  ]) expect(chunk).toContain(text)
  // Neutral below the knee is the colour less its offset.
  toneMap('neutral', [0.2, 0.3, 0.4], 1).forEach((c, i) => expect(c).toBeCloseTo([0.2, 0.3, 0.4][i] - 0.04, 12))
})

test('the shadow box stands on the texel lattice across the light, within half a texel of the camera, casting through the night', () => {
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
    const c = key.target.position
    const basis = new THREE.Matrix4().lookAt(key.position, c, key.shadow.camera.up)
    const X = new THREE.Vector3(), Y = new THREE.Vector3(), Z = new THREE.Vector3()
    basis.extractBasis(X, Y, Z)
    for (const axis of [X, Y]) {
      const units = c.dot(axis) / texel
      expect(Math.abs(units - Math.round(units))).toBeLessThan(1e-6)
      expect(Math.abs(c.clone().sub(cam).dot(axis))).toBeLessThanOrEqual(texel / 2 + 1e-9)
    }
  }
  // Before sunrise the key's intensity is 0 on a new moon, and it still casts, so nothing recompiles at dawn.
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
  const bias = (render: Record<string, unknown>) => {
    const { me, frame } = page({ canvas: true, render })
    frame()
    return me.sky()!.key.shadow.bias
  }
  expect(bias({ shadows: 'soft', ao })).toBe(-SHADOW.bias)
  expect(bias({ shadows: 'hard', ao })).toBe(SHADOW.bias)
  expect(bias({ shadows: 'soft' })).toBe(SHADOW.bias)
})

test('a scene whose land the sky reads is a plugin listed after it, or one it does not list, throws on the first frame', () => {
  expect(() => page({ listed: ['skydome3d', 'terrain3d', 'weather3d', 'render3d'] }).frame()).toThrow('skydome3d is listed before terrain3d, whose land it reads that frame')
  expect(() => page({ listed: ['skydome3d', 'weather3d', 'render3d'] }).frame()).toThrow('skydome3d\'s land is terrain3d\'s, which this scene does not list')
})

test('stale: none yet, a new `to`, `from` or look, the sun turned past envSun, or the fade or a biome\'s share moved past envMix; never the camera or a flash', () => {
  const r = skyOf()
  const then = lit(r, standing())
  expect(stale(LOOK, undefined, then)).toBe(true)
  expect(stale(LOOK, then, lit(skyOf(), standing()))).toBe(false)
  expect(stale(LOOK, then, lit(skyOf(), standing({ lift: 0.8 })))).toBe(false)
  expect(stale(LOOK, then, lit(skyOf(), standing({ to: 'storm' })))).toBe(true)
  expect(stale(LOOK, then, lit(skyOf(), standing({ from: STORM })))).toBe(true)
  expect(stale(LOOK, then, lit(skyOf({ look: { ...LOOK, stars: 0.4 } }), standing()))).toBe(true)
  // The sun turns 2π a day at the equinox on the equator: envSun 0.02 rad is 0.02/2π of a day.
  const eq = { lat: 0, doy: 80.5 }
  const a = lit(skyOf({ ...eq, t: 300 }))
  expect(stale(LOOK, a, lit(skyOf({ ...eq, t: 300 + (0.019 / (2 * Math.PI)) * DAY })))).toBe(false)
  expect(stale(LOOK, a, lit(skyOf({ ...eq, t: 300 + (0.021 / (2 * Math.PI)) * DAY })))).toBe(true)
  // s is the smoothstep of blend: at 0.5 its slope is 1.5.
  const b = lit(r, standing({ blend: 0.5 }))
  expect(stale(LOOK, b, lit(r, standing({ blend: 0.5 + 0.049 / 1.5 })))).toBe(false)
  expect(stale(LOOK, b, lit(r, standing({ blend: 0.5 + 0.051 / 1.5 })))).toBe(true)
  const shared = lit(r, standing({ shares: { dunes: 0.5 } }))
  expect(stale(LOOK, shared, lit(r, standing({ shares: { dunes: 0.56 } })))).toBe(true)
})

test('the environment is the dome alone from the camera, made on the first frame with a renderer and again only when stale, drawn without a flash, lit at envIntensity; close lets it go', () => {
  const noRenderer = page()
  noRenderer.frame()
  expect(gpu.made).toHaveLength(0)

  const { me, plugins, frame, set, now } = page({ canvas: true })
  const scene: THREE.Scene = plugins.render3d.scene
  frame()
  expect(gpu.made).toHaveLength(1)
  const first = gpu.made[0]
  const dome = me.sky()!.dome
  const env = first.scene.children[0] as THREE.Mesh
  expect(first.scene.children).toHaveLength(1)
  expect(env.material).toBe(dome.material)
  expect(first.position.toArray()).toEqual([5, 20, 7])
  expect(scene.environment).toBe(first.target.texture)
  expect(scene.environmentIntensity).toBe(LOOK.envIntensity)

  // The camera and a flash make none.
  plugins.render3d.camera.position.set(400, 60, -800)
  now.weather = standing({ lift: 0.8 })
  frame()
  expect(gpu.made).toHaveLength(1)
  const u = dome.material.uniforms
  expect(u.skyFlash.value).toBe(0.8)

  // A new weather makes one, from where the camera stands now, without the flash, the one before let go.
  now.weather = standing({ lift: 0.8, to: 'storm', from: STORM, blend: 0 })
  frame()
  expect(gpu.made).toHaveLength(2)
  const second = gpu.made[1]
  expect(second.position.toArray()).toEqual([400, 60, -800])
  expect(second.flash).toBe(0)
  // The dome is drawn in the key light less the flash, and the flashed light is put back.
  const key = me.sky()!.key
  close(second.light, key.color.clone().multiplyScalar(key.intensity - 0.8))
  close(u.skyLight.value, key.color.clone().multiplyScalar(key.intensity))
  expect(u.skyFlash.value).toBe(0.8)
  expect(first.target.disposed).toBe(true)
  expect(scene.environment).toBe(second.target.texture)

  // A new look makes one, lit at its envIntensity.
  set({ look: { ...LOOK, envIntensity: 0.4 } })
  frame()
  expect(gpu.made).toHaveLength(3)
  expect(scene.environmentIntensity).toBe(0.4)

  me.close()
  expect(gpu.made[2].target.disposed).toBe(true)
  expect(gpu.pmrems[0].disposed).toBe(true)
  expect(scene.environment).toBeNull()
  expect(scene.environmentIntensity).toBe(1)
})

test('close takes the dome, the lights and the fog off the scene and disposes the dome', () => {
  const { me, plugins, frame } = page({ canvas: true })
  frame()
  const scene: THREE.Scene = plugins.render3d.scene
  const dome = me.sky()!.dome
  const disposed: string[] = []
  dome.geometry.addEventListener('dispose', () => disposed.push('geometry'))
  dome.material.addEventListener('dispose', () => disposed.push('material'))
  me.close()
  expect(scene.children).toHaveLength(0)
  expect(scene.fog).toBeNull()
  expect(disposed.sort()).toEqual(['geometry', 'material'])
  expect(me.light()).toBeUndefined()
  expect(me.sky()).toBeUndefined()
})

const close = (a: THREE.Color, b: THREE.Color, digits = 9) => {
  expect(a.r).toBeCloseTo(b.r, digits)
  expect(a.g).toBeCloseTo(b.g, digits)
  expect(a.b).toBeCloseTo(b.b, digits)
}
