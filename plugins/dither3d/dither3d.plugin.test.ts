// dither3d on render3d with a canvas, in node. Node has no WebGL, so the renderer is a stand-in for
// three's WebGLRenderer that keeps its pixel ratio and size and writes down every draw it was asked
// for, as render3d's own test has it; the composer, its passes and the materials are three's own.
// The GLSL is read, not run: what it draws is looked at on a page.
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import * as THREE from 'three'
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js'
import { render3d } from '#plugins/render3d/render3d.plugin.ts'
import { dither3d, Dither, type Settings } from './dither3d.plugin.ts'

const gpu = vi.hoisted(() => ({ made: [] as any[], draws: [] as { scene: any; target: unknown }[] }))

vi.mock('three', async importOriginal => {
  const three = await importOriginal<typeof import('three')>()
  class WebGLRenderer {
    target: any = null
    pixelRatio = 1
    size = [0, 0]
    autoClear = true
    toneMapping: number = three.NoToneMapping
    toneMappingExposure = 1
    outputColorSpace = three.SRGBColorSpace
    shadowMap = { enabled: false, type: three.PCFShadowMap as number }
    constructor() { gpu.made.push(this) }
    setPixelRatio(r: number) { this.pixelRatio = r }
    getPixelRatio() { return this.pixelRatio }
    setSize(w: number, h: number) { this.size = [w, h] }
    getSize(to: THREE.Vector2) { return to.set(this.size[0], this.size[1]) }
    setRenderTarget(t: any) { this.target = t }
    getRenderTarget() { return this.target }
    getClearColor(to: THREE.Color) { return to }
    setClearColor() {}
    getClearAlpha() { return 1 }
    setClearAlpha() {}
    clear() {}
    clearDepth() {}
    render(scene: any) { gpu.draws.push({ scene, target: this.target }) }
    dispose() {}
    forceContextLoss() {}
  }
  return { ...three, WebGLRenderer }
})

// Each test sets the screen's pixel ratio, and puts back what it found.
const screen = (globalThis as any).devicePixelRatio
beforeEach(() => { gpu.made.length = 0; gpu.draws.length = 0 })
afterEach(() => { (globalThis as any).devicePixelRatio = screen })

const W = 1280, H = 720
const PSX = [-4, 0, -3, 1, 2, -2, 3, -1, -3, 1, -4, 0, 3, -1, 2, -2]
const DITHER: Settings = { on: true, bits: 5, matrix: PSX, ratio: 0.25 }

// A page of render3d with a canvas, its prefab drawn at a pixel ratio of 2 on a screen of 2, and
// dither3d before it, as a scene lists them.
function page(world: Record<string, unknown> = { dither3d: DITHER }, render: Record<string, unknown> | undefined = { camera: { fov: 60, near: 0.1, far: 100, at: [0, 0, 5], look: [0, 0, 0] }, pixelRatio: 2 }) {
  ;(globalThis as any).devicePixelRatio = 2
  const canvas = { style: {} as Record<string, string>, width: W, height: H, remove() {} }
  const plugins: any = {
    wire: { rows: [], scene: { world, prefabs: { engine: { width: W, height: H }, ...(render ? { render3d: render } : {}) } } },
    render3d: render3d(),
  }
  plugins.render3d.mount(canvas)
  const me = dither3d()
  plugins.dither3d = me
  const frame = () => {
    me.tick(plugins)
    plugins.render3d.tick(plugins)
    plugins.render3d.afterTick(plugins)
  }
  return { plugins, me, frame, canvas, renderer: () => gpu.made.at(-1) }
}

const dither = (plugins: any) => plugins.render3d.composer?.passes.find((p: unknown) => p instanceof Dither) as Dither | undefined

test('on, it is drawn after the tone mapping to the canvas, every frame, at the ratio it names shown as blocks, with its bits and matrix', () => {
  const { plugins, frame, canvas, renderer } = page()
  frame()
  const passes = plugins.render3d.composer.passes
  const d = dither(plugins)!
  expect(passes.at(-1)).toBe(d)
  expect(passes.at(-2)).toBeInstanceOf(OutputPass)
  expect(renderer().pixelRatio).toBe(0.25)
  expect(canvas.style.imageRendering).toBe('pixelated')
  const u = d.material.uniforms
  expect([u.levels.value, u.matrix.value, u.height.value]).toEqual([32, PSX, H * 0.25])
  for (let f = 0; f < 3; f++) {
    gpu.draws.length = 0
    frame()
    // Its quad is the last thing drawn, to the canvas, from what the tone mapping wrote.
    const last = gpu.draws.at(-1)!
    expect(last.scene.material).toBe(d.material)
    expect(last.target).toBeNull()
    expect(u.tDiffuse.value).toBe(gpu.draws.at(-2)!.target && (gpu.draws.at(-2)!.target as THREE.WebGLRenderTarget).texture)
  }
  // Handed over once.
  expect(plugins.render3d.composer.passes.filter((p: unknown) => p instanceof Dither)).toHaveLength(1)
})

test('the shader adds the pixel\'s offset from its 4×4 tile, counted from the top left, to the colour rounded to 8 bits, held in 0 to 255, then cuts it to whole steps of 256 / 2^bits', () => {
  const d = new Dither(DITHER, THREE)
  const glsl = d.material.fragmentShader
  expect(glsl).toContain('int x = int(mod(floor(gl_FragCoord.x), 4.0));')
  expect(glsl).toContain('int y = int(mod(floor(height - gl_FragCoord.y), 4.0));')
  expect(glsl).toContain('float offset = matrix[y * 4 + x];')
  expect(glsl).toContain('vec3 c8 = clamp(floor(clamp(c.rgb, 0.0, 1.0) * 255.0 + 0.5) + offset, 0.0, 255.0);')
  expect(glsl).toContain('vec3 q = floor(c8 / (256.0 / levels));')
  expect(glsl).toContain('gl_FragColor = vec4(q / (levels - 1.0), c.a);')
  // No colour space conversion of three's: it writes what it computes.
  expect(glsl).not.toContain('colorspace_fragment')
  d.dispose()
})

test('starting off it hands render3d nothing and leaves its resolution, so the frame is drawn as without it', () => {
  const { plugins, frame, canvas, renderer } = page({ dither3d: { ...DITHER, on: false } })
  const finish = vi.spyOn(plugins.render3d, 'finish')
  const ratio = vi.spyOn(plugins.render3d, 'ratio')
  for (let f = 0; f < 3; f++) frame()
  expect(finish).not.toHaveBeenCalled()
  expect(ratio).not.toHaveBeenCalled()
  expect(plugins.render3d.composer).toBeUndefined()
  expect(renderer().pixelRatio).toBe(2)
  expect(canvas.style.imageRendering).toBe('')
})

test('turned on and off live: on hands the pass over once and lowers the resolution, off passes it over and gives back the prefab\'s', () => {
  const { plugins, me, frame, canvas, renderer } = page({ dither3d: { ...DITHER, on: false } })
  frame()
  const finish = vi.spyOn(plugins.render3d, 'finish')
  me.on = true
  const d = dither(plugins)!
  expect(d.enabled).toBe(true)
  expect([renderer().pixelRatio, canvas.style.imageRendering]).toEqual([0.25, 'pixelated'])
  frame()
  expect(gpu.draws.at(-1)!.scene.material).toBe(d.material)
  me.on = false
  expect(d.enabled).toBe(false)
  expect([renderer().pixelRatio, canvas.style.imageRendering]).toEqual([2, ''])
  gpu.draws.length = 0
  frame()
  expect(gpu.draws.some(x => x.scene.material === d.material)).toBe(false)
  expect(gpu.draws.at(-1)!.target).toBeNull()
  me.on = true
  expect(dither(plugins)).toBe(d)
  expect(d.enabled).toBe(true)
  expect(renderer().pixelRatio).toBe(0.25)
  expect(finish).toHaveBeenCalledTimes(1)
})

test('bits and ratio are set live; ratio moves the resolution only while it is on; a ratio left out leaves render3d\'s own', () => {
  const { plugins, me, frame, renderer } = page()
  frame()
  const d = dither(plugins)!
  me.bits = 3
  expect([me.bits, d.material.uniforms.levels.value]).toEqual([3, 8])
  me.ratio = 0.5
  expect(renderer().pixelRatio).toBe(0.5)
  expect(d.material.uniforms.height.value).toBe(H * 0.5)
  me.on = false
  me.ratio = 0.125
  expect(renderer().pixelRatio).toBe(2)
  me.on = true
  expect(renderer().pixelRatio).toBe(0.125)
  // With no ratio, on or off, the resolution is render3d's.
  me.ratio = undefined
  expect(renderer().pixelRatio).toBe(2)
  me.on = false
  me.on = true
  expect(renderer().pixelRatio).toBe(2)
  expect(() => { me.bits = 0 }).toThrow('dither3d bits 0 is not a whole number from 1 to 8')
  expect(() => { me.bits = 4.5 }).toThrow('dither3d bits 4.5 is not a whole number from 1 to 8')
  expect(() => { me.ratio = -1 }).toThrow('dither3d ratio -1 is not above 0')
})

test('a bits set before the pass is made is the one it is made with', () => {
  const { plugins, me, frame } = page({ dither3d: { ...DITHER, on: false } })
  frame()
  me.bits = 2
  me.on = true
  expect(dither(plugins)!.material.uniforms.levels.value).toBe(4)
})

test('what the scene gives is checked on the first tick, naming the number; a scene without render3d, or before the first tick, throws', () => {
  const bad: [unknown, string][] = [
    [undefined, 'the scene names dither3d but gives no world.dither3d'],
    [{ ...DITHER, on: 1 }, 'dither3d on 1 is not true or false'],
    [{ ...DITHER, bits: 9 }, 'dither3d bits 9 is not a whole number from 1 to 8'],
    [{ ...DITHER, matrix: [1, 2, 3] }, 'dither3d matrix [1,2,3] is not 16 numbers'],
    [{ ...DITHER, ratio: 0 }, 'dither3d ratio 0 is not above 0'],
  ]
  for (const [s, message] of bad) {
    const { frame } = page(s === undefined ? {} : { dither3d: s })
    expect(frame).toThrow(message)
  }
  const bare = dither3d()
  expect(() => bare.tick({ wire: { rows: [], scene: { world: { dither3d: DITHER }, prefabs: {} } } } as any)).toThrow('dither3d needs render3d, which this scene does not name')
  expect(() => { bare.on = true }).toThrow('dither3d has not ticked yet, so it has no on')
  expect(() => bare.bits).toThrow('dither3d has not ticked yet, so it has no bits')
  expect(() => bare.ratio).toThrow('dither3d has not ticked yet, so it has no ratio')
})

test('the world it is handed is copied: writing it live does not change the scene', () => {
  const world = { dither3d: { ...DITHER, matrix: [...PSX] } }
  const { me, frame } = page(world)
  frame()
  me.bits = 2
  me.ratio = 0.5
  expect([world.dither3d.bits, world.dither3d.ratio]).toEqual([5, 0.25])
})
