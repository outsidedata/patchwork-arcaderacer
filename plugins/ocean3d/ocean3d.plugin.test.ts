// The sea's browser half on render3d, in node, drawing a row and numbers this test writes, under a
// stand-in sky and ground its scene's mods hand it, or a fixed light and no sky at all. Node has no
// WebGL, so the renderer is a stand-in for three's WebGLRenderer that keeps every draw it was asked
// for: the material, the values of its uniforms at that moment, the target and the camera. Everything
// else is three's own: the materials, their chunks, the targets and the textures.
//
// The mods are imported as a game's are, by scenemanager's `load` of a scene naming them: `sky()`
// loads `sea`, a manager's one child this test writes, with a real sky over the sea, whose
// `world.ocean3d.mods` name skydome3d's light and wind and terrain3d's land. It is loaded before all.
import { afterAll, beforeAll, beforeEach, expect, test, vi } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import * as THREE from 'three'
import { boot, type Scene, type Truth, type W } from '#engine/engine.ts'
import { load } from '#addons/scenemanager/scenemanager.addon.ts'
import { scenemanager } from '#plugins/scenemanager/scenemanager.sim.ts'
import { written } from '#plugins/loader/loader.sim.ts'
import { render3d } from '#plugins/render3d/render3d.plugin.ts'
import type { Weather } from '#plugins/skydome3d/skydome3d.sim.ts'
import { RES, spectrum } from './ocean3d.sim.ts'
import { disc, ocean3d, radii, type Fixed, type Numbers } from './ocean3d.plugin.ts'

type Draw = { name: string; values: Record<string, unknown>; target: THREE.WebGLRenderTarget | null; camera: THREE.Camera }
const gpu = vi.hoisted(() => ({ renderers: [] as any[], draws: [] as Draw[] }))

vi.mock('three', async importOriginal => {
  const three = await importOriginal<typeof import('three')>()
  class WebGLRenderer {
    params: any
    target: any = null
    toneMapping: number = three.NoToneMapping
    toneMappingExposure = 1
    shadowMap = { enabled: false, type: three.PCFShadowMap as number }
    constructor(params: any) { this.params = params; gpu.renderers.push(this) }
    setPixelRatio() {}
    getPixelRatio() { return 1 }
    setSize() {}
    setRenderTarget(t: any) { this.target = t }
    getRenderTarget() { return this.target }
    render(scene: THREE.Scene, camera: THREE.Camera) {
      const quad = scene.children[0] as THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>
      const m = quad?.material
      if (!(m instanceof three.ShaderMaterial)) return
      const values = Object.fromEntries(Object.entries(m.uniforms).map(([k, u]) => [k, u.value]))
      gpu.draws.push({ name: m.name, values, target: this.target, camera })
    }
    dispose() {}
    forceContextLoss() {}
  }
  return { ...three, WebGLRenderer }
})

beforeEach(() => { gpu.renderers.length = 0; gpu.draws.length = 0 })

const SEA: Numbers = {
  windSpeed: 9, windDeg: 30, fetchKm: 300, swellScale: 0.4, swellDeg: 65, amp: 0.35, chop: 1.1, foamRecovery: 0.35, seed: 731,
  patches: [250, 17, 5], shoalDepth: 60, shoalFloor: 0, repeat: 200, weather: { windRef: 12, floor: 0.2 },
  deep: '#06222e', scatter: '#1b6a74', glow: 0.4, glowPower: 4, glint: 1.55, glintPower: 480, foamColour: '#e8f0f0', foamJ: [0.5, 0.8],
  bubbles: 2, bubbleEdge: 0.25, alpha: 0.7, clearDepth: 12, rings: 180, segs: 256, far: 6000, depthHalf: 3000, depthMax: 64, depthRes: 256, depthRows: 8,
}
// The mods the sea's scene names: the sky's light and wind, and the land.
const MODS = { light: 'skydome3d', wind: 'skydome3d', land: 'terrain3d' }
// A shelf: 0 m deep at z = 0, falling 0.05 m a metre out to sea toward −z.
const shelf = (x: number, z: number) => Math.max(0, -z * 0.05 + Math.sin(x * 0.01))

// ---------------------------------------------------------------- the sea's scene

const DT = 1 / 60
const weather = (over: Partial<Weather>): Weather => ({ cloud: 0, cirrus: 0.1, base: 1400, top: 2000, dense: 1, rain: 0, snow: 0, fog: 0, haze: 1, wind: 2, gust: 0, thunder: 0, dust: 0, ...over })
const WEATHERS = 'test/ocean3d/plugin-weathers.json'
written(WEATHERS, JSON.stringify({ clear: weather({}), storm: weather({ cloud: 0.97, rain: 1, wind: 14 }) }))
const top: Scene = {
  prefabs: { engine: { dt: DT }, scenemanager: { scenes: { sea: { file: 'sea.scene.json', suspend: false } }, dt: DT, entry: 'sea', port: 0 } },
  actors: [{ is: 'scenemanager' }],
  plugins: ['scenemanager'],
  seats: 1,
}
const seaScene = {
  world: {
    ocean3d: { ...SEA, mods: MODS },
    skydome3d: { day: 1200, weathers: 'weathers', soak: 6, dry: 45, lay: 55, melt: 90, gusts: [3, 7, 11], bolt: { lasts: [0.1, 0.2], out: [300, 900] } },
    loader: { assets: { weathers: { type: 'json', url: WEATHERS, preload: true } } },
  },
  prefabs: {
    loader: {},
    skydome3d: {
      t: 600, rate: 1, doy: 172, lat: 46, phase: 0.25, to: 'clear', from: weather({}), mix: weather({}), blend: 1, fade: 0,
      wet: 0, pack: 0, windDeg: 90, flash: 0, strike: [0, 0], drift: [0, 0],
    },
    ocean3d: { t: 10 },
    probe: {},
  },
  actors: [{ is: 'loader' }, { is: 'skydome3d' }, { is: 'ocean3d' }, { is: 'probe' }],
}
const dir = mkdtempSync(join(tmpdir(), 'ocean3d-plugin-'))
const path = (p: string) => JSON.stringify(new URL(p, import.meta.url).pathname)
writeFileSync(join(dir, 'sea.scene.json'), JSON.stringify(seaScene))
writeFileSync(join(dir, 'sea.sim.ts'), `
import { loader } from ${path('../loader/loader.sim.ts')}
import { skydome3d } from ${path('../skydome3d/skydome3d.sim.ts')}
import { ocean3d } from ${path('./ocean3d.sim.ts')}
import file from './sea.scene.json' with { type: 'json' }
export const sim = { loader, skydome3d, ocean3d, probe: { before(_me, _dt, w) { globalThis.ocean3dPluginSea = w } } }
export const scene = file
`)
afterAll(() => rmSync(dir, { recursive: true }))

// The sea's scene loaded as a game's child is, stepped once by 0 s so its probe hands over its `w`.
async function sky(): Promise<{ truth: Truth; w: W }> {
  const truth = (await load(boot(structuredClone(top), { scenemanager }), pathToFileURL(dir + '/').href)).get('sea')!
  truth.step(0)
  return { truth, w: (globalThis as any).ocean3dPluginSea }
}
beforeAll(sky)

// ---------------------------------------------------------------- a page

type Edits = { land: unknown; layers: { version: number; rect: number[] }[] }
// A page whose ocean3d row's `t` is `o.t` and whose `world.ocean3d` is SEA naming `o.mods` (MODS when
// not given) with `o.sea` over it, its scene listing `o.listed`; `set` writes numbers over the scene's
// `world.ocean3d`, as a new scene would hand them. With `o.sky` false the page has no skydome3d at all,
// and its scene names the land alone unless `o.mods` says otherwise.
function page(o: {
  t?: number; sea?: Partial<Numbers>; canvas?: boolean; ground?: boolean | ((x: number, z: number) => number); edits?: () => Edits
  mods?: Partial<typeof MODS>; listed?: string[]; sky?: boolean
} = {}) {
  const row = { id: 4, kind: 'ocean3d', data: { t: o.t ?? 10 } }
  const light = {
    sun: new THREE.Vector3(0.3, 0.6, -0.74).normalize(), sunColor: new THREE.Color(1.2, 1.1, 0.9),
    zenith: new THREE.Color(0.05, 0.12, 0.4), horizon: new THREE.Color(0.5, 0.6, 0.7), fog: new THREE.FogExp2(0xffffff, 0.001),
  }
  const depth = typeof o.ground === 'function' ? o.ground : shelf
  const plugins: any = {
    wire: {
      rows: [row],
      scene: {
        world: { ocean3d: { ...SEA, mods: o.mods ?? (o.sky === false ? { land: MODS.land } : MODS), ...o.sea } },
        plugins: o.listed ?? (o.sky === false ? ['terrain3d', 'ocean3d', 'render3d'] : ['terrain3d', 'skydome3d', 'ocean3d', 'render3d']),
        prefabs: { engine: { width: 320, height: 200 }, render3d: { camera: { fov: 62, near: 0.15, far: 9000, at: [3.3, 12, -7.9], look: [0, 0, -100] } } },
      },
    },
    render3d: render3d(),
    terrain3d: o.ground === false ? {} : { ground: { depth, ...(o.edits ? { edits: o.edits } : {}) } },
  }
  if (o.sky !== false) plugins.skydome3d = { light: () => light }
  if (o.canvas !== false) plugins.render3d.mount({ style: {}, remove() {} })
  const me = ocean3d()
  const frame = () => {
    plugins.render3d.tick(plugins)
    me.afterTick(plugins)
  }
  const numbers = () => plugins.wire.scene.world.ocean3d as Numbers
  const set = (change: Partial<Numbers>) => { plugins.wire.scene.world.ocean3d = { ...numbers(), ...change } }
  return { plugins, me, row, numbers, set, light, frame, eye: () => plugins.render3d.camera.position as THREE.Vector3 }
}
const named = (name: string) => gpu.draws.filter(d => d.name === name)

// ---------------------------------------------------------------- the surface

test('the colour pass is transparent with no depth write, LEQUAL, renderOrder −1, the front side under the scene\'s fog, and its shader ends in three\'s tonemapping, colorspace and fog chunks', () => {
  const { me, frame, plugins } = page()
  frame()
  const { colour } = me.sea()!
  const m = colour.material
  expect(m.transparent).toBe(true)
  expect(m.depthWrite).toBe(false)
  expect(m.depthFunc).toBe(THREE.LessEqualDepth)
  expect(m.side).toBe(THREE.FrontSide)
  expect(m.fog).toBe(true)
  expect(colour.renderOrder).toBe(-1)
  expect(plugins.render3d.scene.children).toContain(colour)
  const f = m.fragmentShader
  const tone = f.indexOf('#include <tonemapping_fragment>'), space = f.indexOf('#include <colorspace_fragment>'), fog = f.indexOf('#include <fog_fragment>')
  expect(tone).toBeGreaterThan(f.indexOf('gl_FragColor = vec4( colour'))
  expect(space).toBeGreaterThan(tone)
  expect(fog).toBeGreaterThan(space)
  expect(m.vertexShader).toContain('#include <fog_vertex>')
  expect(m.uniforms.fogDensity).toBeDefined()
})

test('the depth pre-pass is the same geometry and displacement, DoubleSide at renderOrder 1 with no colour, pushed back 0.2 % of its distance', () => {
  const { me, frame } = page()
  frame()
  const { colour, prepass } = me.sea()!
  expect(prepass.geometry).toBe(colour.geometry)
  expect(prepass.material.uniforms).toBe(colour.material.uniforms)
  expect(prepass.material.vertexShader).toBe(colour.material.vertexShader)
  expect(prepass.material.side).toBe(THREE.DoubleSide)
  expect(prepass.renderOrder).toBe(1)
  expect(prepass.material.colorWrite).toBe(false)
  expect(prepass.material.depthWrite).toBe(true)
  expect(prepass.material.transparent).toBe(false)
  expect(prepass.material.defines).toEqual({ PREPASS: '' })
  expect(prepass.material.vertexShader).toMatch(/#ifdef PREPASS\s+mvPosition\.xyz \*= 1\.002;\s+#endif\s+gl_Position = projectionMatrix \* mvPosition;/)
  expect(prepass.position.toArray()).toEqual(colour.position.toArray())
})

test('the disc: rings at A(e^{6.25i/rings} − 1) out to far, a centre and segs vertices a ring, each triangle counter-clockwise from above, each vertex its spacing', () => {
  const r = radii(180, 6000)
  const A = 6000 / (Math.exp(6.25) - 1)
  expect(r).toHaveLength(181)
  expect(r[0]).toBe(0)
  expect(r[1]).toBeCloseTo(A * (Math.exp(6.25 / 180) - 1), 9)
  expect(r[90]).toBeCloseTo(A * (Math.exp(6.25 / 2) - 1), 9)
  expect(r[180]).toBe(6000)
  const rings = 12, segs = 16
  const g = disc(THREE, rings, segs, 500)
  const rr = radii(rings, 500)
  const pos = g.getAttribute('position'), spacing = g.getAttribute('spacing'), index = g.getIndex()!
  expect(pos.count).toBe(1 + rings * segs)
  expect(index.count).toBe(3 * (segs + 2 * segs * (rings - 1)))
  for (let v = 1; v < pos.count; v++) {
    const i = 1 + Math.floor((v - 1) / segs)
    expect(Math.hypot(pos.getX(v), pos.getZ(v))).toBeCloseTo(rr[i], 3)
    expect(pos.getY(v)).toBe(0)
    const out = i < rings ? rr[i + 1] - rr[i] : rr[i] - rr[i - 1]
    expect(spacing.getX(v)).toBeCloseTo(Math.max(out, (2 * Math.PI * rr[i]) / segs), 4)
  }
  expect(spacing.getX(0)).toBeCloseTo(rr[1], 6)
  // The cross product of every triangle's edges points up: counter-clockwise seen from above.
  const p = (k: number) => new THREE.Vector3().fromBufferAttribute(pos, index.getX(k))
  for (let t = 0; t < index.count; t += 3) {
    const a = p(t), b = p(t + 1), c = p(t + 2)
    expect(b.clone().sub(a).cross(c.clone().sub(a)).y).toBeGreaterThan(0)
  }
})

test('the disc is recentred on the camera snapped to the innermost ring\'s spacing', () => {
  const { me, frame, eye } = page()
  frame()
  const { colour, prepass, snap } = me.sea()!
  expect(snap).toBeCloseTo(radii(180, 6000)[1], 6)
  expect(colour.position.toArray()).toEqual([Math.round(3.3 / snap) * snap, 0, Math.round(-7.9 / snap) * snap])
  const at = colour.position.clone()
  eye().x += snap * 0.4
  frame()
  expect(colour.position.toArray()).toEqual(at.toArray())
  eye().set(1234.56, 40, -987.65)
  frame()
  expect(colour.position.x / snap).toBeCloseTo(Math.round(1234.56 / snap), 9)
  expect(colour.position.z / snap).toBeCloseTo(Math.round(-987.65 / snap), 9)
  expect(Math.abs(colour.position.x - 1234.56)).toBeLessThanOrEqual(snap / 2)
  expect(prepass.position.toArray()).toEqual(colour.position.toArray())
})

test('a vertex reads each cascade at its world xz with the half-texel offset removed, at mip max(0, log2(spacing·RES/patch)); the fragment at the same place', () => {
  const { me, frame } = page()
  frame()
  const { colour, uniforms } = me.sea()!
  const v = colour.material.vertexShader, f = colour.material.fragmentShader
  for (const c of [0, 1, 2]) {
    expect(v).toContain(`textureLod( oceanDisp${c}, at.xz / oceanPatch${c} + 0.5 / 256.0, max( 0.0, log2( spacing * 256.0 / oceanPatch${c} ) ) )`)
    expect(f).toContain(`texture2D( oceanDeriv${c}, vOceanAt / oceanPatch${c} + 0.5 / 256.0 )`)
    expect(uniforms[`oceanPatch${c}`].value).toBe(SEA.patches[c])
  }
  // Foam from cascades 0 and 1 only.
  expect(f).toContain('texture2D( oceanDisp1, vOceanAt / oceanPatch1 + 0.5 / 256.0 ).w')
  expect(f).not.toContain('texture2D( oceanDisp2, vOceanAt / oceanPatch2 + 0.5 / 256.0 ).w')
})

// ---------------------------------------------------------------- the FFT

test('each cascade each frame: evolve h, evolve D, two inverse transforms of a bit-reverse, 8 butterflies and a sign pass, then the displacement and the derivatives, all through an orthographic camera', () => {
  const { me, frame, row, plugins } = page({ t: 37.5 })
  frame()
  const order = gpu.draws.map(d => d.name)
  const transform = ['bit reverse', ...Array(8).fill('butterfly'), 'sign']
  const one = ['evolve h', 'evolve D', ...transform, ...transform, 'displacement', 'derivatives']
  expect(order).toEqual([...one, ...one, ...one])
  for (const d of gpu.draws) {
    expect(d.camera).toBeInstanceOf(THREE.OrthographicCamera)
    expect(d.target).toBeInstanceOf(THREE.WebGLRenderTarget)
    expect([d.target!.width, d.target!.height]).toEqual([RES, RES])
    expect(d.target!.texture.type).toBe(THREE.HalfFloatType)
  }
  expect(named('butterfly').slice(0, 8).map(d => d.values.span)).toEqual([1, 2, 4, 8, 16, 32, 64, 128])
  const s = me.sea()!
  named('evolve h').forEach((d, c) => {
    expect(d.values.spectrum).toBe(s.textures[c])
    expect(d.values.cycle).toBe(37.5 / 200)
    expect(d.values.amp).toBe(0.35)
  })
  named('evolve D').forEach((d, c) => expect(d.values.dK).toBeCloseTo((2 * Math.PI) / SEA.patches[c], 12))
  named('displacement').forEach((d, c) => {
    expect(d.values.chop).toBe(1.1)
    expect(d.values.texel).toBe(SEA.patches[c] / RES)
    expect(d.target!.texture).toBe(s.uniforms[`oceanDisp${c}`].value)
    expect(d.target!.texture.generateMipmaps).toBe(true)
    expect(d.target!.texture.minFilter).toBe(THREE.LinearMipmapLinearFilter)
    expect(d.target!.texture.wrapS).toBe(THREE.RepeatWrapping)
  })
  named('derivatives').forEach((d, c) => {
    expect(d.target!.texture).toBe(s.uniforms[`oceanDeriv${c}`].value)
    expect(d.target!.texture.generateMipmaps).toBe(true)
  })
  // The renderer is handed back the target it had.
  expect(plugins.render3d.renderer.getRenderTarget()).toBe(null)
  // The next frame writes the other displacement target and reads this one's history.
  const first = named('displacement').map(d => d.target)
  gpu.draws.length = 0
  row.data.t = 37.6
  frame()
  named('displacement').forEach((d, c) => {
    expect(d.target).not.toBe(first[c])
    expect((d.values.prev as THREE.Texture)).toBe(first[c]!.texture)
    expect(s.uniforms[`oceanDisp${c}`].value).toBe(d.target!.texture)
  })
})

test('the evolve pass forces .zw to 0; the D pass packs Dx + iDz and the spectral slopes; the history is min(J, prev + Δt·foamRecovery/max(J, 0.5))', () => {
  const { me, frame } = page()
  frame()
  const p = me.sea()!.passes
  expect(p.evolveH.fragmentShader).toContain('gl_FragColor = vec4( h * amp, 0.0, 0.0 );')
  expect(p.evolveH.fragmentShader).toContain('6.283185307179586 * fract( a.z * cycle )')
  expect(p.evolveD.fragmentShader).toContain('gl_FragColor = vec4( dx + vec2( -dz.y, dz.x ), sx + vec2( -sz.y, sz.x ) );')
  expect(p.displacement.fragmentShader).toContain('min( J, texelFetch( prev, p, 0 ).w + recover / max( J, 0.5 ) )')
  expect(p.displacement.defines).toEqual({ DISPLACEMENT: '' })
  expect(p.derivatives.defines).toEqual({})
})

test('foam does not advance while t stands still, advances by the change in t times foamRecovery, across the wrap too, and is cleared only when it should be', () => {
  const { frame, row, set, me } = page({ t: 50 })
  const last = () => named('displacement').slice(-3).map(d => [d.values.recover, d.values.clear])
  frame()
  expect(last()).toEqual([[0, 1], [0, 1], [0, 1]])
  for (let i = 0; i < 3; i++) {
    frame()
    expect(last()).toEqual([[0, 0], [0, 0], [0, 0]])
  }
  row.data.t = 50.5
  frame()
  for (const [recover, clear] of last()) { expect(recover).toBeCloseTo(0.5 * 0.35, 12); expect(clear).toBe(0) }
  row.data.t = 199.9
  frame()
  row.data.t = 0.1
  frame()
  for (const [recover] of last()) expect(recover).toBeCloseTo(0.2 * 0.35, 9)
  // foamRecovery is not a sea change; amp, chop and the spectrum's numbers are.
  set({ foamRecovery: 1 })
  frame()
  expect(last().map(v => v[1])).toEqual([0, 0, 0])
  const textures = me.sea()!.textures
  for (const change of [{ amp: 0.3 }, { chop: 1 }, { windSpeed: 10 }, { patches: [250, 17, 4] }] as Partial<Numbers>[]) {
    set(change)
    frame()
    expect(last().map(v => v[1])).toEqual([1, 1, 1])
    frame()
    expect(last().map(v => v[1])).toEqual([0, 0, 0])
  }
  expect(me.sea()!.textures).not.toBe(textures)
})

test('the history is cleared when the renderer first appears, and nothing is drawn until an FFT has run', () => {
  const { frame, plugins, me, row } = page({ canvas: false })
  frame()
  expect(gpu.draws).toHaveLength(0)
  expect(me.sea()!.colour.visible).toBe(false)
  expect(me.sea()!.prepass.visible).toBe(false)
  row.data.t = 12
  frame()
  plugins.render3d.mount({ style: {}, remove() {} })
  frame()
  expect(named('displacement').map(d => d.values.clear)).toEqual([1, 1, 1])
  expect(me.sea()!.colour.visible).toBe(true)
  expect(me.sea()!.prepass.visible).toBe(true)
})

test('the spectrum textures are the server half\'s spectrum of the sea\'s numbers, float for float, and are made again only when those numbers change', () => {
  const { frame, me, numbers, set } = page()
  frame()
  const s = me.sea()!
  const want = spectrum(numbers())
  expect(s.spectrum!.key).toBe(want.key)
  s.textures.forEach((t, c) => {
    expect(t).toBeInstanceOf(THREE.DataTexture)
    expect(t.image.data).toBeInstanceOf(Float32Array)
    expect([t.image.width, t.image.height, t.format, t.type, t.minFilter, t.magFilter]).toEqual([RES, RES, THREE.RGBAFormat, THREE.FloatType, THREE.NearestFilter, THREE.NearestFilter])
    expect(Buffer.from((t.image.data as Float32Array).buffer).equals(Buffer.from(want.cascades[c].packed.buffer))).toBe(true)
  })
  const disposed: THREE.Texture[] = []
  for (const t of s.textures) t.addEventListener('dispose', () => disposed.push(t))
  set({ amp: 0.2, chop: 0.8, foamRecovery: 2, glint: 3 })
  frame()
  expect(me.sea()!.textures).toBe(s.textures)
  set({ seed: 9 })
  frame()
  expect(disposed).toEqual(s.textures)
  expect(Buffer.from((me.sea()!.textures[0].image.data as Float32Array).buffer).equals(Buffer.from(spectrum(numbers()).cascades[0].packed.buffer))).toBe(true)
})

test('a sea of two cascades makes a surface of two, and foam from both', () => {
  const { frame, me, set } = page()
  frame()
  set({ patches: [250, 17] })
  frame()
  const { colour, disp, deriv } = me.sea()!
  expect(disp).toHaveLength(2)
  expect(deriv).toHaveLength(2)
  expect(colour.material.vertexShader).not.toContain('oceanDisp2')
  expect(colour.material.fragmentShader).toContain('texture2D( oceanDisp1, vOceanAt / oceanPatch1 + 0.5 / 256.0 ).w')
  expect(named('displacement').slice(-2)).toHaveLength(2)
})

// ---------------------------------------------------------------- the sky and the seabed

test('the sun and the sky are taken from the light mod\'s light, skydome3d\'s light(), every frame, a fixed light beside it unread, and the sea\'s look every frame', () => {
  const { frame, me, light, set } = page({ sea: { light: { sun: [0, -1, 0], sunColor: '#000000', zenith: '#000000', horizon: '#000000' } } })
  frame()
  const u = me.sea()!.uniforms
  const same = () => {
    expect((u.oceanSun.value as THREE.Vector3).toArray()).toEqual(light.sun.toArray())
    expect((u.oceanSunColour.value as THREE.Color).toArray()).toEqual(light.sunColor.toArray())
    expect((u.oceanZenith.value as THREE.Color).toArray()).toEqual(light.zenith.toArray())
    expect((u.oceanHorizon.value as THREE.Color).toArray()).toEqual(light.horizon.toArray())
  }
  same()
  light.sun.set(0, -0.2, 0.98).normalize()
  light.sunColor.setRGB(0, 0, 0)
  light.zenith.setRGB(0.01, 0.01, 0.03)
  light.horizon.setRGB(0.02, 0.03, 0.05)
  frame()
  same()
  expect((u.oceanDeep.value as THREE.Color).getHexString()).toBe('06222e')
  expect((u.oceanScatter.value as THREE.Color).getHexString()).toBe('1b6a74')
  expect((u.oceanFoamColour.value as THREE.Color).getHexString()).toBe('e8f0f0')
  set({ deep: '#102030', glint: 2, glintPower: 100, alpha: 0.5, foamJ: [0.4, 0.9], bubbles: 3, bubbleEdge: 0.1, glow: 0.2, glowPower: 6, shoalDepth: 5, shoalFloor: 0.1 })
  frame()
  expect((u.oceanDeep.value as THREE.Color).getHexString()).toBe('102030')
  expect([u.oceanGlint.value, u.oceanGlintPower.value, u.oceanAlpha.value, u.oceanBubbles.value, u.oceanBubbleEdge.value, u.oceanGlow.value, u.oceanGlowPower.value, u.oceanShoalDepth.value, u.oceanShoalFloor.value])
    .toEqual([2, 100, 0.5, 3, 0.1, 0.2, 6, 5, 0.1])
  expect((u.oceanFoamJ.value as THREE.Vector2).toArray()).toEqual([0.4, 0.9])
})

test('nothing is made before the camera and the sky\'s first light, a fixed light given beside it or not, and a scene missing render3d, or not listing the light\'s or the land\'s plugin before the sea, throws', () => {
  for (const sea of [{}, { light: { sun: [0, 1, 0], sunColor: '#ffffff', zenith: '#3366aa', horizon: '#aabbcc' } as Fixed }]) {
    const a = page({ sea })
    a.plugins.skydome3d.light = () => undefined
    a.frame()
    expect(a.me.sea()).toBeUndefined()
    expect(a.plugins.render3d.scene.children).toHaveLength(0)
  }
  const b = page()
  b.me.afterTick(b.plugins)
  expect(b.me.sea()).toBeUndefined()
  const c = page()
  delete c.plugins.render3d
  expect(() => c.me.afterTick(c.plugins)).toThrow('ocean3d draws through render3d, which this scene does not list')
  for (const [listed, says] of [
    [['terrain3d', 'ocean3d', 'render3d'], 'ocean3d\'s light is skydome3d\'s, which this scene does not list'],
    [['skydome3d', 'ocean3d', 'render3d'], 'ocean3d\'s land is terrain3d\'s, which this scene does not list'],
    [['terrain3d', 'ocean3d', 'skydome3d', 'render3d'], 'ocean3d is listed before skydome3d, whose light it reads that frame'],
    [['skydome3d', 'ocean3d', 'terrain3d', 'render3d'], 'ocean3d is listed before terrain3d, whose land it reads that frame'],
  ] as [string[], string][]) {
    const d = page({ listed })
    expect(() => d.frame()).toThrow(says)
    expect(d.me.sea()).toBeUndefined()
  }
  // The wind is read off the rows, which no plugin's afterTick places, so no order is asked of its plugin.
  const after = page({ mods: { wind: 'skydome3d' }, listed: ['ocean3d', 'skydome3d', 'render3d'], sea: { light: { sun: [0, 1, 0], sunColor: '#ffffff', zenith: '#3366aa', horizon: '#aabbcc' } } })
  after.frame()
  expect(after.me.sea()!.colour.visible).toBe(true)
  const none = page()
  none.plugins.wire.rows = []
  none.frame()
  expect(none.me.sea()).toBeUndefined()
})

const FIXED: Fixed = { sun: [1, 2, -2], sunColor: '#fff4e0', zenith: '#3366aa', horizon: '#aabbcc' }

test('with no sky at all the sea is drawn in the fixed world.ocean3d.light once the camera is there: the sun normalised, the colours authored sRGB, read every frame, at amp itself', () => {
  const { frame, me, plugins, set } = page({ sky: false, sea: { light: FIXED } })
  me.afterTick(plugins)
  expect(me.sea()).toBeUndefined()
  frame()
  const s = me.sea()!
  expect(s.colour.visible).toBe(true)
  expect(s.prepass.visible).toBe(true)
  const u = s.uniforms
  const sun = u.oceanSun.value as THREE.Vector3
  ;[1 / 3, 2 / 3, -2 / 3].forEach((v, i) => expect(sun.getComponent(i)).toBeCloseTo(v, 12))
  // Each colour is three's linear value of its sRGB string, as `deep`'s is.
  const linear = (c: string) => new THREE.Color(c).toArray()
  expect((u.oceanSunColour.value as THREE.Color).toArray()).toEqual(linear('#fff4e0'))
  expect((u.oceanZenith.value as THREE.Color).toArray()).toEqual(linear('#3366aa'))
  expect((u.oceanHorizon.value as THREE.Color).toArray()).toEqual(linear('#aabbcc'))
  expect((u.oceanSunColour.value as THREE.Color).getHexString()).toBe('fff4e0')
  expect(named('evolve h').map(d => d.values.amp)).toEqual([0.35, 0.35, 0.35])
  set({ light: { sun: [0, 0, 3], sunColor: '#102030', zenith: '#000000', horizon: '#ffffff' } })
  frame()
  expect(sun.toArray()).toEqual([0, 0, 1])
  expect((u.oceanSunColour.value as THREE.Color).getHexString()).toBe('102030')
  expect((u.oceanZenith.value as THREE.Color).getHexString()).toBe('000000')
  expect((u.oceanHorizon.value as THREE.Color).getHexString()).toBe('ffffff')
})

test('a scene with neither a light mod nor a fixed light throws, naming both ways to light the sea', () => {
  const { frame } = page({ sky: false })
  expect(frame).toThrow('ocean3d draws in a light, and this scene gives none: name the plugin whose light it is in world.ocean3d.mods.light, or give a fixed one in world.ocean3d.light')
  const unlit = page({ mods: { wind: 'skydome3d', land: 'terrain3d' } })
  expect(unlit.frame).toThrow('world.ocean3d.mods.light, or give a fixed one in world.ocean3d.light')
})

test('the tile\'s first bake is whole: depth/depthMax in R8 over ±depthHalf around the camera snapped to a tile texel', () => {
  const { frame, me } = page({ sea: { depthRes: 64, depthHalf: 320, depthMax: 16 } })
  frame()
  const { tile, uniforms } = me.sea()!
  const texel = 640 / 64
  expect(tile.centre).toEqual([Math.round(3.3 / texel) * texel, Math.round(-7.9 / texel) * texel])
  expect((uniforms.oceanTile.value as THREE.Vector4).toArray()).toEqual([...tile.centre, 320, 1])
  expect(uniforms.oceanDepthMax.value).toBe(16)
  expect(tile.texture.format).toBe(THREE.RedFormat)
  expect(tile.texture.type).toBe(THREE.UnsignedByteType)
  expect(tile.texture.image.data).toBe(tile.data)
  for (let j = 0; j < 64; j++) for (let i = 0; i < 64; i++) {
    const x = tile.centre[0] - 320 + (i + 0.5) * texel, z = tile.centre[1] - 320 + (j + 0.5) * texel
    expect(tile.data[j * 64 + i]).toBe(Math.round(Math.min(1, shelf(x, z) / 16) * 255))
  }
  // Toward the sea the tile reads deep water, and at the shore none.
  expect(tile.data[0]).toBe(255)
  expect(tile.data[63 * 64]).toBe(0)
})

test('with no ground yet the sea is open ocean everywhere, and the first ground is baked whole', () => {
  const { frame, me, plugins } = page({ ground: false, sea: { depthRes: 32, depthHalf: 160 } })
  frame()
  const { tile, uniforms } = me.sea()!
  expect((uniforms.oceanTile.value as THREE.Vector4).w).toBe(0)
  expect(tile.baked).toBe(false)
  expect(me.sea()!.colour.material.vertexShader).toContain('if ( oceanTile.w < 0.5 || any( lessThan( t, vec2( 0.0 ) ) ) || any( greaterThan( t, vec2( 1.0 ) ) ) ) return 1.0e4;')
  plugins.terrain3d.ground = { depth: () => 32 }
  frame()
  expect(tile.baked).toBe(true)
  expect((uniforms.oceanTile.value as THREE.Vector4).w).toBe(1)
  expect(tile.data.every(v => v === 128)).toBe(true)
})

test('with no land mod the sea is open ocean everywhere, whatever ground a plugin of the page holds', () => {
  const { frame, me, plugins } = page({ mods: { light: 'skydome3d', wind: 'skydome3d' }, listed: ['skydome3d', 'ocean3d', 'render3d'], sea: { depthRes: 32, depthHalf: 160 } })
  expect(plugins.terrain3d.ground).toBeDefined()
  for (let n = 0; n < 3; n++) frame()
  const { tile, uniforms } = me.sea()!
  expect((uniforms.oceanTile.value as THREE.Vector4).w).toBe(0)
  expect(tile.baked).toBe(false)
  expect(me.sea()!.colour.visible).toBe(true)
})

test('a camera more than depthHalf/2 from the tile\'s centre starts a bake of depthRows rows a frame into a second buffer, which swaps in with its centre once complete', () => {
  let level = 8
  const { frame, me, eye } = page({ ground: () => level, sea: { depthRes: 32, depthHalf: 160, depthRows: 8 } })
  frame()
  const { tile, uniforms } = me.sea()!
  const first = tile.data, centre = [...tile.centre]
  expect(first.every(v => v === 32)).toBe(true)
  level = 16
  eye().x = centre[0] + 79
  frame()
  expect(tile.next).toBeUndefined()
  eye().x = centre[0] + 81
  frame()
  // A quarter of the rows are baked into the other buffer; the shown tile and its centre stand.
  expect(tile.next!.row).toBe(8)
  expect(tile.data).toBe(first)
  expect(tile.centre).toEqual(centre)
  expect((uniforms.oceanTile.value as THREE.Vector4).x).toBe(centre[0])
  expect(first.every(v => v === 32)).toBe(true)
  frame()
  frame()
  expect(tile.next!.row).toBe(24)
  expect(tile.data).toBe(first)
  frame()
  expect(tile.next).toBeUndefined()
  expect(tile.data).not.toBe(first)
  expect(tile.data.every(v => v === 64)).toBe(true)
  expect(tile.texture.image.data).toBe(tile.data)
  const texel = 320 / 32
  expect(tile.centre).toEqual([Math.round((centre[0] + 81) / texel) * texel, centre[1]])
  expect((uniforms.oceanTile.value as THREE.Vector4).toArray()).toEqual([...tile.centre, 160, 1])
})

test('close takes the sea off the scene and disposes every geometry, material, texture and target', () => {
  const { frame, me, plugins } = page()
  frame()
  const s = me.sea()!
  const disposed = new Set<unknown>()
  const watch = (x: THREE.EventDispatcher<any>) => x.addEventListener('dispose', () => disposed.add(x))
  const all = [s.geometry, s.colour.material, s.prepass.material, ...Object.values(s.passes), ...s.textures, s.tile.texture, ...s.disp.flat(), ...s.deriv, ...s.scratch, s.quad.geometry]
  expect(s.scratch).toHaveLength(4)
  for (const x of all) watch(x as THREE.EventDispatcher<any>)
  me.close()
  expect(plugins.render3d.scene.children).not.toContain(s.colour)
  expect(plugins.render3d.scene.children).not.toContain(s.prepass)
  for (const x of all) expect(disposed.has(x)).toBe(true)
  expect(me.sea()).toBeUndefined()
  me.close()
})

test('the alpha rises from mix(alpha, 1, fresnel) to 1 over clearDepth metres of the tile\'s depth, and fades out at the shore', () => {
  const { frame, me, set } = page()
  frame()
  const { colour, uniforms } = me.sea()!
  expect(colour.material.fragmentShader).toContain('float alpha = mix( mix( oceanAlpha, 1.0, fresnel ), 1.0, smoothstep( 0.0, oceanClearDepth, vOceanDepth ) );')
  expect(colour.material.fragmentShader).toContain('gl_FragColor = vec4( colour, alpha * smoothstep( 0.0, 0.28, s ) );')
  expect(colour.material.vertexShader).toContain('vOceanDepth = depth;')
  expect(colour.material.vertexShader).toContain('float s = oceanShoalFloor + ( 1.0 - oceanShoalFloor ) * smoothstep( 0.0, oceanShoalDepth, depth );')
  expect(uniforms.oceanClearDepth.value).toBe(12)
  set({ clearDepth: 20 })
  frame()
  expect(uniforms.oceanClearDepth.value).toBe(20)
})

test('an edit to the ground that reaches the tile starts a sliced bake at the same centre; one outside it, or none, does not', () => {
  let level = 8
  const land = {}
  // One layer over the tile, and one past each of its four edges, over it along the other axis: the
  // tile is ±160 m around (0, −10).
  const layers = [
    { version: 0, rect: [10, 10, 40, 40] },
    { version: 0, rect: [5000, 10, 5100, 40] }, { version: 0, rect: [-5100, 10, -5000, 40] },
    { version: 0, rect: [10, 5000, 40, 5100] }, { version: 0, rect: [10, -5100, 40, -5000] },
  ]
  const { frame, me } = page({ ground: () => level, edits: () => ({ land, layers: layers.map(l => ({ ...l })) }), sea: { depthRes: 32, depthHalf: 160, depthRows: 8 } })
  frame()
  const { tile } = me.sea()!
  const centre = [...tile.centre]
  expect(centre).toEqual([0, -10])
  frame()
  expect(tile.next).toBeUndefined()
  // A layer outside the tile in x, either side, or in z, either side, moves: nothing is baked.
  level = 16
  for (const outside of layers.slice(1)) {
    outside.version++
    frame()
    expect(tile.next).toBeUndefined()
  }
  // A layer over the tile moves: a bake at the same centre, a quarter a frame, swapped in whole.
  layers[0].version++
  frame()
  expect(tile.next!.row).toBe(8)
  expect(tile.next!.centre).toEqual(centre)
  expect(tile.data.every(v => v === 32)).toBe(true)
  frame(); frame(); frame()
  expect(tile.next).toBeUndefined()
  expect(tile.centre).toEqual(centre)
  expect(tile.data.every(v => v === 64)).toBe(true)
  frame()
  expect(tile.next).toBeUndefined()
  // An edit during a bake leaves it running: it swaps in with its first rows baked before the edit,
  // and one more bake follows for the edit. A new land is an edit everywhere.
  layers[0].version++
  frame()
  expect(tile.next!.row).toBe(8)
  level = 4
  layers[0].version++
  frame()
  expect(tile.next!.row).toBe(16)
  frame(); frame()
  expect(tile.next).toBeUndefined()
  expect(tile.data.subarray(0, 8 * 32).every(v => v === 64)).toBe(true)
  expect(tile.data.subarray(8 * 32).every(v => v === 16)).toBe(true)
  frame()
  expect(tile.next!.row).toBe(8)
  frame(); frame(); frame()
  expect(tile.next).toBeUndefined()
  expect(tile.data.every(v => v === 16)).toBe(true)
  frame()
  expect(tile.next).toBeUndefined()
  const landed = page({ ground: () => level, edits: () => ({ land: {}, layers: [] }), sea: { depthRes: 32, depthHalf: 160, depthRows: 8 } })
  landed.frame()
  landed.frame()
  expect(landed.me.sea()!.tile.next!.row).toBe(8)
})

test('a brush held over the tile never starts its bake again: each bake runs to its end and swaps in, the next follows for the edits since, and the last shows the last edit', () => {
  let level = 8
  const land = {}
  const layers = [{ version: 0, rect: [10, 10, 40, 40] }]
  const { frame, me } = page({ ground: () => level, edits: () => ({ land, layers: layers.map(l => ({ ...l })) }), sea: { depthRes: 32, depthHalf: 160, depthRows: 8 } })
  frame()
  const { tile } = me.sea()!
  // Twenty frames of a stroke, each moving the layer and the ground under it.
  const rows: (number | undefined)[] = [], swapped: number[] = []
  for (let n = 1; n <= 20; n++) {
    level = 8 + n
    layers[0].version++
    const shown = tile.data
    frame()
    rows.push(tile.next?.row)
    if (tile.data !== shown) swapped.push(n)
  }
  expect(rows).toEqual(Array.from({ length: 5 }, () => [8, 16, 24, undefined]).flat())
  expect(swapped).toEqual([4, 8, 12, 16, 20])
  // Let go: one more bake, for the edits since the last began, and then none.
  frame()
  expect(tile.next!.row).toBe(8)
  frame(); frame(); frame()
  expect(tile.next).toBeUndefined()
  expect(tile.data.every(v => v === Math.round((28 / 64) * 255))).toBe(true)
  frame()
  expect(tile.next).toBeUndefined()
})
