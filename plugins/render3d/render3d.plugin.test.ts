// render3d on scenes this test writes itself, in node. Node has no WebGL, so the renderer is a stand-in
// for three's WebGLRenderer that keeps what it was made with and every draw it was asked for: the
// scene or full-screen quad drawn, the material a full-screen pass drew with, the target it was drawn
// into, and the override material the scene carried. Everything else is three's own: the camera, the
// composer and its passes, the materials.
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import * as THREE from 'three'
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js'
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js'
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js'
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js'
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js'
import { Pass } from 'three/addons/postprocessing/Pass.js'
import { render3d, type Splice } from './render3d.plugin.ts'

type Draw = { scene: THREE.Object3D; material?: THREE.ShaderMaterial; target: THREE.WebGLRenderTarget | null; override: THREE.Material | null; camera?: THREE.Camera; autoClear?: boolean }
const gpu = vi.hoisted(() => ({ made: [] as any[], draws: [] as Draw[], depthCleared: [] as { before: number; target: unknown }[] }))

vi.mock('three', async importOriginal => {
  const three = await importOriginal<typeof import('three')>()
  class WebGLRenderer {
    params: any
    target: any = null
    pixelRatio = 1
    size = [0, 0]
    autoClear = true
    autoClearColor = true
    autoClearDepth = true
    autoClearStencil = true
    toneMapping: number = three.NoToneMapping
    toneMappingExposure = 1
    outputColorSpace = three.SRGBColorSpace
    shadowMap = { enabled: false, type: three.PCFShadowMap as number }
    clearColor = new three.Color()
    clearAlpha = 1
    disposed = false
    lost = false
    constructor(params: any) { this.params = params; gpu.made.push(this) }
    setPixelRatio(r: number) { this.pixelRatio = r }
    getPixelRatio() { return this.pixelRatio }
    setSize(w: number, h: number) { this.size = [w, h] }
    getSize(to: THREE.Vector2) { return to.set(this.size[0], this.size[1]) }
    setRenderTarget(t: any) { this.target = t }
    getRenderTarget() { return this.target }
    getClearColor(to: THREE.Color) { return to.copy(this.clearColor) }
    setClearColor(c: THREE.ColorRepresentation, a?: number) { this.clearColor.set(c); if (a !== undefined) this.clearAlpha = a }
    getClearAlpha() { return this.clearAlpha }
    setClearAlpha(a: number) { this.clearAlpha = a }
    clear() {}
    clearDepth() { gpu.depthCleared.push({ before: gpu.draws.length, target: this.target }) }
    render(scene: any, camera: any) {
      if (this.autoClear && scene.isScene) this.clear()
      gpu.draws.push({ scene, material: scene.material, target: this.target, override: scene.overrideMaterial ?? null, camera, autoClear: this.autoClear })
    }
    dispose() { this.disposed = true }
    forceContextLoss() { this.lost = true }
  }
  return { ...three, WebGLRenderer }
})

// A test that sets the screen's pixel ratio puts back what it found.
const ratio = (globalThis as any).devicePixelRatio
beforeEach(() => { gpu.made.length = 0; gpu.draws.length = 0; gpu.depthCleared.length = 0 })
afterEach(() => { (globalThis as any).devicePixelRatio = ratio })

const W = 400, H = 300
const camera = { fov: 90, near: 0.1, far: 100, at: [0, 0, 0], look: [0, 0, -1] }
const ao = { on: true, radius: 0.5, thickness: 1, falloff: 1, scale: 1, intensity: 0.8, samples: 16 }
const wire = (render: any) => ({ wire: { scene: { prefabs: { engine: { width: W, height: H }, ...(render ? { render3d: render } : {}) } }, rows: [] } }) as any
const canvas = () => ({ style: {} as Record<string, string>, width: W, height: H, removed: false, remove() { this.removed = true } })

// A render3d with a canvas mounted and its prefab read, as a page has it after its first tick.
const page = (prefab: any = { camera }) => {
  const me = render3d()
  const c = canvas()
  me.mount(c as any)
  me.tick(wire(prefab))
  return { me, c }
}

test('the prefab makes the camera: its field of view, near, far and the canvas\'s shape, at `at` looking at `look`', () => {
  const me = render3d()
  me.tick(wire({ camera: { fov: 62, near: 0.15, far: 9000, at: [3, 4, 5], look: [3, 4, -5] } }))
  const cam = me.camera!
  expect(cam).toBeInstanceOf(THREE.PerspectiveCamera)
  expect([cam.fov, cam.near, cam.far, cam.aspect]).toEqual([62, 0.15, 9000, W / H])
  expect(cam.position.toArray()).toEqual([3, 4, 5])
  const dir = cam.getWorldDirection(new THREE.Vector3())
  expect(dir.x).toBeCloseTo(0)
  expect(dir.y).toBeCloseTo(0)
  expect(dir.z).toBeCloseTo(-1)
  const bare = render3d()
  bare.tick(wire(undefined))
  expect(bare.camera).toBeUndefined()
  expect(() => render3d().tick(wire({}))).toThrow('the render3d prefab has no camera')
})

test('project is the canvas point of a world point through the camera as it stands, behind where the camera draws nothing, and the same under reversed depth', () => {
  const me = render3d()
  me.tick(wire({ camera }))
  const cam = me.camera!
  const known = () => {
    const middle = me.project([0, 0, -5])
    expect(middle.x).toBeCloseTo(W / 2)
    expect(middle.y).toBeCloseTo(H / 2)
    expect(middle.behind).toBe(false)
    // tan(45°) is 1: a point 1 right and 1 up at 5 away is a fifth of the way to each edge, the
    // width over an aspect of 4/3.
    const off = me.project([1, 1, -5])
    expect(off.x).toBeCloseTo(W / 2 * (1 + 0.2 / (W / H)))
    expect(off.y).toBeCloseTo(H / 2 * (1 - 0.2))
    expect(me.project([0, 0, 5]).behind).toBe(true)
    expect(me.project([0, 0, -0.05]).behind).toBe(true)
    expect(me.project([0, 0, -150]).behind).toBe(true)
    expect(me.project([0, 0, -99]).behind).toBe(false)
    expect(me.project([0, 0, -0.1]).behind).toBe(false)
  }
  known()
  // The camera as it stands: moved after the prefab placed it.
  cam.position.set(1, 0, 0)
  expect(me.project([1, 0, -5]).x).toBeCloseTo(W / 2)
  cam.position.set(0, 0, 0)
  // A reversed-depth renderer turns the camera's projection over the first time it draws with it.
  const standard = cam.projectionMatrix.elements[10]
  ;(cam as unknown as { _reversedDepth: boolean })._reversedDepth = true
  cam.updateProjectionMatrix()
  expect(cam.projectionMatrix.elements[10]).not.toBe(standard)
  known()
  expect(() => render3d().project([0, 0, 0])).toThrow('render3d has no camera')
})

test('the renderer is made once, when there is a canvas and a prefab, whichever came second, with reversed depth only with ao', () => {
  page()
  expect(gpu.made).toHaveLength(1)
  const first = gpu.made[0]
  expect(first.params.reversedDepthBuffer).toBe(false)
  const later = render3d()
  later.tick(wire({ camera }))
  expect(gpu.made).toHaveLength(1)
  const c = canvas()
  later.mount(c as any)
  later.tick(wire({ camera }))
  later.tick(wire({ camera }))
  expect(gpu.made).toHaveLength(2)
  expect(gpu.made[1].params.canvas).toBe(c)
  expect(later.renderer).toBe(gpu.made[1])
  // A canvas and no prefab: nothing to draw with, so no renderer.
  const none = render3d()
  none.mount(canvas() as any)
  none.tick(wire(undefined))
  expect(gpu.made).toHaveLength(2)
  page({ camera, ao })
  expect(gpu.made).toHaveLength(3)
  expect(gpu.made[2].params.reversedDepthBuffer).toBe(true)
  // Drawn at the engine's size.
  expect(first.size).toEqual([W, H])
})

test('the look comes from the prefab, and a field left out leaves three\'s own setting', () => {
  const plain = page()
  const r = gpu.made[0]
  expect([r.toneMapping, r.toneMappingExposure, r.shadowMap.enabled, r.pixelRatio]).toEqual([THREE.NoToneMapping, 1, false, 1])
  expect(plain.me.scene.background).toBeNull()
  ;(globalThis as any).devicePixelRatio = 3
  const looked = page({ camera, pixelRatio: 2, tone: 'aces', exposure: 0.7, shadows: 'soft', background: '#336699' })
  const l = gpu.made[1]
  expect([l.toneMapping, l.toneMappingExposure, l.shadowMap.enabled, l.shadowMap.type, l.pixelRatio]).toEqual([THREE.ACESFilmicToneMapping, 0.7, true, THREE.PCFShadowMap, 2])
  expect((looked.me.scene.background as THREE.Color).getHexString()).toBe('336699')
  ;(globalThis as any).devicePixelRatio = 1.5
  page({ camera, pixelRatio: 2, tone: 'neutral', shadows: 'hard' })
  const h = gpu.made[2]
  expect([h.toneMapping, h.shadowMap.type, h.pixelRatio]).toEqual([THREE.NeutralToneMapping, THREE.BasicShadowMap, 1.5])
  page({ camera, tone: 'none', shadows: 'none' })
  expect([gpu.made[3].toneMapping, gpu.made[3].shadowMap.enabled]).toEqual([THREE.NoToneMapping, false])
})

test('a tone or shadows the prefab names wrongly throws where the prefab is read, with no canvas and no renderer', () => {
  const me = render3d()
  expect(() => me.tick(wire({ camera, tone: 'filmic' }))).toThrow('render3d tone filmic is none of aces, neutral, none')
  expect(me.camera).toBeUndefined()
  expect(() => render3d().tick(wire({ camera, shadows: 'blurry' }))).toThrow('render3d shadows blurry is none of soft, hard, none')
  expect(gpu.made).toHaveLength(0)
})

test('with no ao the scene is drawn straight to the canvas once a frame, and not before the canvas is shown', () => {
  const { me, c } = page()
  expect(c.style.display).toBe('none')
  for (let f = 0; f < 3; f++) me.afterTick()
  expect(c.style.display).toBe('')
  expect(gpu.draws).toHaveLength(3)
  for (const d of gpu.draws) expect([d.scene, d.target, d.override]).toEqual([me.scene, null, null])
})

test('with ao the scene is drawn once a frame with no override material, and every pass that reads depth reads the depth texture the scene was drawn into, with no normals', () => {
  const { me } = page({ camera, ao })
  me.scene.add(new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial()))
  for (let f = 0; f < 4; f++) {
    gpu.draws.length = 0
    me.afterTick()
    const scene = gpu.draws.filter(d => d.scene === me.scene)
    expect(scene).toHaveLength(1)
    expect(scene[0].override).toBeNull()
    const depth = scene[0].target!.depthTexture!
    expect(depth).toBeInstanceOf(THREE.DepthTexture)
    expect(depth.type).toBe(THREE.FloatType)
    // Every full-screen pass after it that samples depth samples that one texture.
    const readers = gpu.draws.map(d => d.material).filter(m => m?.uniforms?.tDepth) as THREE.ShaderMaterial[]
    expect(readers.length).toBeGreaterThanOrEqual(2)
    for (const m of readers) {
      expect(m.uniforms.tDepth.value).toBe(depth)
      expect(m.uniforms.tNormal.value ?? null).toBeNull()
      expect(m.defines.NORMAL_VECTOR_TYPE).toBe(0)
    }
    // The last draw is to the canvas.
    expect(gpu.draws[gpu.draws.length - 1].target).toBeNull()
  }
})

test('the AO pass holds no target it does not draw into each frame, each at the canvas\'s size, and close disposes every target and material it holds', () => {
  const added = vi.spyOn(EffectComposer.prototype, 'addPass')
  const { me } = page({ camera, ao })
  const gtao = added.mock.calls.map(([pass]) => pass).find(pass => pass instanceof GTAOPass)!
  added.mockRestore()
  const held = Object.values(gtao).filter(v => v instanceof THREE.WebGLRenderTarget) as THREE.WebGLRenderTarget[]
  expect(held).toHaveLength(2)
  for (const t of held) expect([t.width, t.height]).toEqual([W, H])
  me.afterTick()
  const into = new Set(gpu.draws.map(d => d.target))
  for (const t of held) expect(into.has(t)).toBe(true)
  // Its only depth texture is the one the scene was drawn into.
  const depths = Object.values(gtao).filter(v => v instanceof THREE.DepthTexture)
  expect(depths).toEqual([gpu.draws.find(d => d.scene === me.scene)!.target!.depthTexture])
  const disposed = new Set<unknown>()
  const owned = [...held, ...Object.values(gtao).filter(v => v instanceof THREE.Material)] as (THREE.WebGLRenderTarget | THREE.Material)[]
  for (const o of owned) o.addEventListener('dispose', () => disposed.add(o))
  me.close()
  expect(owned.filter(o => !disposed.has(o))).toEqual([])
})

test('an AO whose `on` is false or left out is off: no AO pass, no composer, no reversed depth, its settings kept', () => {
  for (const off of [{ ...ao, on: false }, (({ on: _, ...rest }) => rest)(ao)]) {
    const added = vi.spyOn(EffectComposer.prototype, 'addPass')
    const { me } = page({ camera, ao: off })
    const passes = added.mock.calls.map(([pass]) => pass)
    added.mockRestore()
    expect(passes).toEqual([])
    expect(gpu.made.at(-1).params.reversedDepthBuffer).toBe(false)
    gpu.draws.length = 0
    me.afterTick()
    // Drawn straight to the canvas.
    expect(gpu.draws.filter(d => d.scene === me.scene).map(d => d.target)).toEqual([null])
    me.close()
  }
})

test('with bloom the scene is drawn once a frame into a half-float target, bloomed as the prefab says after the AO, and tone mapped only by the last pass, to the canvas', () => {
  const bloom = { strength: 0.42, radius: 0.26, threshold: 1 }
  for (const prefab of [{ camera, bloom }, { camera, ao, bloom }]) {
    const added = vi.spyOn(EffectComposer.prototype, 'addPass')
    const { me } = page(prefab)
    const passes = added.mock.calls.map(([pass]) => pass)
    added.mockRestore()
    expect(gpu.made.at(-1).params.reversedDepthBuffer).toBe(!!prefab.ao)
    const kind = (p: unknown) => [RenderPass, GTAOPass, UnrealBloomPass, OutputPass].find(k => p instanceof k)
    expect(passes.map(kind).filter(Boolean)).toEqual([RenderPass, ...(prefab.ao ? [GTAOPass] : []), UnrealBloomPass, OutputPass])
    const glow = passes.find(p => p instanceof UnrealBloomPass) as UnrealBloomPass
    expect([glow.strength, glow.radius, glow.threshold]).toEqual([0.42, 0.26, 1])
    gpu.draws.length = 0
    me.afterTick()
    const scene = gpu.draws.filter(d => d.scene === me.scene)
    expect(scene).toHaveLength(1)
    expect(scene[0].target!.texture.type).toBe(THREE.HalfFloatType)
    expect(gpu.draws.at(-1)!.target).toBeNull()
    const composed = vi.spyOn(EffectComposer.prototype, 'dispose')
    const freed = vi.spyOn(glow, 'dispose')
    me.close()
    expect(composed).toHaveBeenCalledTimes(1)
    expect(freed).toHaveBeenCalledTimes(1)
    composed.mockRestore()
  }
})

// Something put in the overlay, a box a hand's width in front of the camera.
const inOverlay = (me: ReturnType<typeof render3d>) => {
  const box = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.1), new THREE.MeshStandardMaterial())
  box.position.set(0, 0, -0.15)
  me.overlay.scene.add(box)
  me.overlay.camera.near = 0.02
  me.overlay.camera.far = 5
  me.overlay.camera.updateProjectionMatrix()
  return box
}

test('drawn straight, an overlay with something in it is drawn after the world each frame, the depth cleared between and not the colour, through a camera where the world\'s stands with its own near and far; an empty one is not drawn', () => {
  const { me } = page()
  me.afterTick()
  expect(gpu.draws.map(d => d.scene)).toEqual([me.scene])
  expect(gpu.depthCleared).toEqual([])
  inOverlay(me)
  for (const [at, look, fov] of [[[1, 2, 3], [4, 2, -3], 70], [[-5, 9, 0.5], [0, 0, 0], 20]] as [number[], number[], number][]) {
    gpu.draws.length = 0
    gpu.depthCleared.length = 0
    me.camera!.position.fromArray(at)
    me.camera!.lookAt(look[0], look[1], look[2])
    me.camera!.fov = fov
    me.camera!.updateProjectionMatrix()
    me.afterTick()
    expect(gpu.draws.map(d => d.scene)).toEqual([me.scene, me.overlay.scene])
    const [world, over] = gpu.draws
    expect([world.camera, over.camera]).toEqual([me.camera, me.overlay.camera])
    expect(over.autoClear).toBe(false)
    expect(gpu.depthCleared).toEqual([{ before: 1, target: null }])
    const cam = me.overlay.camera
    expect(cam.position.toArray()).toEqual(me.camera!.position.toArray())
    expect(cam.quaternion.angleTo(me.camera!.quaternion)).toBeCloseTo(0, 6)
    expect([cam.fov, cam.aspect, cam.near, cam.far]).toEqual([fov, W / H, 0.02, 5])
    // Its projection is its own near and far, not the world's.
    expect(cam.projectionMatrix.equals(new THREE.PerspectiveCamera(fov, W / H, 0.02, 5).projectionMatrix)).toBe(true)
  }
  // The renderer clears the colour of the next frame as it did before.
  expect(gpu.made[0].autoClear).toBe(true)
})

test('through the composer the overlay is drawn after the AO and before the bloom, into the target holding the frame so far, its depth cleared first; an empty one draws nothing', () => {
  const bloom = { strength: 0.42, radius: 0.26, threshold: 1 }
  for (const prefab of [{ camera, ao }, { camera, bloom }, { camera, ao, bloom }]) {
    const added = vi.spyOn(EffectComposer.prototype, 'addPass')
    const { me } = page(prefab)
    const passes = added.mock.calls.map(([pass]) => pass)
    added.mockRestore()
    const kind = (p: unknown) => [RenderPass, GTAOPass, UnrealBloomPass, OutputPass].find(k => p instanceof k)?.name ?? 'overlay'
    expect(passes.map(kind)).toEqual(['RenderPass', ...(prefab.ao ? ['GTAOPass'] : []), 'overlay', ...(prefab.bloom ? ['UnrealBloomPass'] : []), 'OutputPass'])
    me.afterTick()
    expect(gpu.draws.some(d => d.scene === me.overlay.scene)).toBe(false)
    inOverlay(me)
    for (let f = 0; f < 3; f++) {
      gpu.draws.length = 0
      gpu.depthCleared.length = 0
      me.afterTick()
      const i = gpu.draws.findIndex(d => d.scene === me.overlay.scene)
      expect(i).toBeGreaterThan(0)
      expect(gpu.draws.filter(d => d.scene === me.overlay.scene)).toHaveLength(1)
      const over = gpu.draws[i]
      expect(over.autoClear).toBe(false)
      // Its depth cleared right before it, in its own target.
      expect(gpu.depthCleared).toContainEqual({ before: i, target: over.target })
      // The frame so far: the AO's blend where there is AO, else the scene itself.
      const world = gpu.draws.find(d => d.scene === me.scene)!
      const last = gpu.draws[i - 1]
      expect(over.target).toBe(prefab.ao ? last.target : world.target)
      if (prefab.ao) expect(last.material).toBe((passes.find(p => p instanceof GTAOPass) as GTAOPass).blendMaterial)
      // The bloom reads what the overlay drew into.
      if (prefab.bloom) {
        const glow = passes.find(p => p instanceof UnrealBloomPass) as UnrealBloomPass
        const read = gpu.draws.slice(i + 1).find(d => d.material?.uniforms?.tDiffuse)!
        expect(read.material!.uniforms.tDiffuse.value).toBe(over.target!.texture)
        expect(gpu.draws.slice(i + 1).some(d => d.material === (glow as any).materialHighPassFilter)).toBe(true)
      }
      expect(gpu.draws.at(-1)!.target).toBeNull()
    }
    me.close()
  }
})

// An effect another plugin hands over: it writes down the depth it held and the target it read from
// each time it is drawn, its size, and whether it was disposed.
class Probe extends Pass {
  depth?: THREE.DepthTexture | null
  seen: { depth: unknown; read: THREE.WebGLRenderTarget }[] = []
  size: number[] = []
  freed = 0
  render(_r: THREE.WebGLRenderer, _write: THREE.WebGLRenderTarget, read: THREE.WebGLRenderTarget) { this.seen.push({ depth: this.depth, read }) }
  setSize(w: number, h: number) { this.size = [w, h] }
  dispose() { this.freed++ }
}

test('an effect is drawn every frame after the AO and before the overlay, holding the depth the scene was drawn with, and render3d disposes it on close', () => {
  const bloom = { strength: 0.42, radius: 0.26, threshold: 1 }
  for (const prefab of [{ camera }, { camera, ao }, { camera, bloom }]) {
    const { me } = page(prefab)
    const outline = new Probe(), other = new Probe()
    const added = vi.spyOn(EffectComposer.prototype, 'addPass')
    // Handed over once the renderer is made, each makes the composer again with it in.
    me.pass('outline', outline)
    me.pass('other', other)
    expect(() => me.pass('outline', new Probe())).toThrow('render3d already has the pass outline')
    // The passes of the composer made last.
    const calls = added.mock.calls.map(([pass]) => pass)
    const passes = calls.slice(calls.map(p => p instanceof RenderPass).lastIndexOf(true))
    added.mockRestore()
    const kind = (p: unknown) => (p === outline ? 'outline' : p === other ? 'other' : [RenderPass, GTAOPass, UnrealBloomPass, OutputPass].find(k => p instanceof k)?.name ?? 'overlay')
    expect(passes.map(kind)).toEqual(['RenderPass', ...(prefab.ao ? ['GTAOPass'] : []), 'outline', 'other', 'overlay', ...(prefab.bloom ? ['UnrealBloomPass'] : []), 'OutputPass'])
    expect(outline.size).toEqual([W, H])
    for (let f = 0; f < 3; f++) {
      me.afterTick()
      const world = gpu.draws.filter(d => d.scene === me.scene).at(-1)!
      const depth = world.target!.depthTexture
      expect(depth).toBeInstanceOf(THREE.DepthTexture)
      expect(outline.seen.at(-1)!.depth).toBe(depth)
      expect(other.seen.at(-1)!.depth).toBe(depth)
      // Without AO it reads the very target the scene was drawn into.
      if (!prefab.ao) expect(outline.seen.at(-1)!.read).toBe(world.target)
    }
    expect(outline.seen).toHaveLength(3)
    expect(outline.freed).toBe(0)
    me.close()
    expect([outline.freed, other.freed]).toEqual([1, 1])
  }
})

test('an effect handed over before the renderer is made is in the composer it makes', () => {
  const me = render3d()
  const outline = new Probe()
  me.pass('outline', outline)
  me.mount(canvas() as any)
  me.tick(wire({ camera }))
  me.afterTick()
  const world = gpu.draws.find(d => d.scene === me.scene)!
  expect(outline.seen).toEqual([{ depth: world.target!.depthTexture, read: world.target }])
  expect(gpu.draws.at(-1)!.target).toBeNull()
  me.close()
})

test('a finish pass is drawn every frame after the tone mapping, in the order handed over, reading what the tone mapping wrote; the last one enabled draws to the canvas; render3d disposes it on close', () => {
  const bloom = { strength: 0.42, radius: 0.26, threshold: 1 }
  for (const prefab of [{ camera }, { camera, ao }, { camera, bloom }]) {
    const { me } = page(prefab)
    const outline = new Probe(), first = new Probe(), second = new Probe()
    me.pass('outline', outline)
    const added = vi.spyOn(EffectComposer.prototype, 'addPass')
    me.finish('first', first)
    me.finish('second', second)
    expect(() => me.finish('first', new Probe())).toThrow('render3d already has the finish pass first')
    const calls = added.mock.calls.map(([pass]) => pass)
    const passes = calls.slice(calls.map(p => p instanceof RenderPass).lastIndexOf(true))
    added.mockRestore()
    const kind = (p: unknown) => (p === outline ? 'outline' : p === first ? 'first' : p === second ? 'second' : [RenderPass, GTAOPass, UnrealBloomPass, OutputPass].find(k => p instanceof k)?.name ?? 'overlay')
    expect(passes.map(kind)).toEqual(['RenderPass', ...(prefab.ao ? ['GTAOPass'] : []), 'outline', 'overlay', ...(prefab.bloom ? ['UnrealBloomPass'] : []), 'OutputPass', 'first', 'second'])
    expect(first.size).toEqual([W, H])
    const output = passes.find(p => p instanceof OutputPass) as OutputPass
    for (let f = 0; f < 3; f++) {
      gpu.draws.length = 0
      me.afterTick()
      // The tone mapping drew into a target, and the first finish pass read that target.
      const toned = gpu.draws.find(d => d.material === (output as any)._fsQuad.material)!
      expect(toned.target).not.toBeNull()
      expect(first.seen.at(-1)!.read).toBe(toned.target)
      expect(first.seen.at(-1)!.depth).toBeUndefined()
      expect([output.renderToScreen, first.renderToScreen, second.renderToScreen]).toEqual([false, false, true])
    }
    expect([first.seen.length, second.seen.length]).toEqual([3, 3])
    // Turned off, it is passed over, and the one before it draws to the canvas.
    second.enabled = false
    me.afterTick()
    expect([first.renderToScreen, second.seen.length]).toEqual([true, 3])
    first.enabled = false
    gpu.draws.length = 0
    me.afterTick()
    expect(output.renderToScreen).toBe(true)
    expect(gpu.draws.at(-1)!.target).toBeNull()
    me.close()
    expect([first.freed, second.freed, outline.freed]).toEqual([1, 1, 1])
  }
})

test('a finish pass alone makes a composer of half-float targets, and one handed over before the renderer is made is in it', () => {
  const me = render3d()
  const finish = new Probe()
  me.finish('finish', finish)
  me.mount(canvas() as any)
  me.tick(wire({ camera }))
  me.afterTick()
  const passes = me.composer!.passes
  expect(passes.map(p => p === finish ? 'finish' : [RenderPass, OutputPass].find(k => p instanceof k)?.name ?? 'overlay')).toEqual(['RenderPass', 'overlay', 'OutputPass', 'finish'])
  expect(me.composer!.renderTarget1.texture.type).toBe(THREE.HalfFloatType)
  expect(finish.seen).toHaveLength(1)
  expect(finish.renderToScreen).toBe(true)
  me.close()
})

test('ratio draws that many pixels per canvas pixel at once, the composer and every pass sized again, shown as blocks or smoothed; ratio() goes back to the prefab\'s', () => {
  ;(globalThis as any).devicePixelRatio = 2
  for (const prefab of [{ camera, pixelRatio: 2 }, { camera, pixelRatio: 2, ao }, { camera }]) {
    const { me, c } = page(prefab)
    const finish = new Probe(), effect = new Probe()
    me.finish('finish', finish)
    me.pass('effect', effect)
    const r = gpu.made.at(-1)
    const was = prefab.pixelRatio ?? 1
    expect(r.pixelRatio).toBe(was)
    expect(c.style.imageRendering).toBe('')
    me.ratio(0.25, 'blocks')
    expect(r.pixelRatio).toBe(0.25)
    expect(r.size).toEqual([W, H])
    expect(c.style.imageRendering).toBe('pixelated')
    const target = me.composer!.renderTarget1
    expect([target.width, target.height]).toEqual([W * 0.25, H * 0.25])
    expect(finish.size).toEqual([W * 0.25, H * 0.25])
    expect(effect.size).toEqual([W * 0.25, H * 0.25])
    const gtao = me.composer!.passes.find(p => p instanceof GTAOPass) as GTAOPass | undefined
    if (gtao) expect([gtao.width, gtao.height]).toEqual([W * 0.25, H * 0.25])
    // Smoothed, at a ratio above the screen's: the prefab's cap does not hold it.
    me.ratio(3)
    expect(r.pixelRatio).toBe(3)
    expect(c.style.imageRendering).toBe('')
    expect(finish.size).toEqual([W * 3, H * 3])
    me.ratio(0.5, 'blocks')
    me.ratio()
    expect(r.pixelRatio).toBe(was)
    expect(c.style.imageRendering).toBe('')
    expect(finish.size).toEqual([W * was, H * was])
    expect(() => me.ratio(0)).toThrow('render3d ratio 0 is not above 0')
    me.close()
  }
})

test('a ratio asked for before the renderer is made is what it is made with', () => {
  const me = render3d()
  me.ratio(0.5, 'blocks')
  const c = canvas()
  me.mount(c as any)
  expect(c.style.imageRendering).toBe('pixelated')
  me.tick(wire({ camera, pixelRatio: 2 }))
  expect(gpu.made.at(-1).pixelRatio).toBe(0.5)
  me.close()
})

// Surfaces with the same glsl and uniforms of their own, one with other glsl, and a splice. Each test
// makes its own wet surfaces, so a uniform one test writes is not another's.
const wetness = (value: number): Splice => ({ uniforms: { wetness: { value } }, fragment: { color_fragment: 'diffuseColor.rgb *= 1.0 - wetness * 0.5;' } })
const dry: Splice = { fragment: { color_fragment: 'diffuseColor.rgb *= 1.2;' } }
const snow: Splice = { uniforms: { cover: { value: 0 } }, fragment: { common: 'uniform float cover;', color_fragment: 'diffuseColor.rgb = mix( diffuseColor.rgb, vec3( 1.0 ), cover );' } }

test('the dress cache key changes with a splice and with a surface, and never otherwise', () => {
  const me = render3d()
  const key = (m: THREE.Material) => m.customProgramCacheKey()
  const wet = wetness(0.5)
  const a = me.dress(new THREE.MeshStandardMaterial(), { surface: wet })
  const b = me.dress(new THREE.MeshStandardMaterial({ color: 0xff0000 }), { surface: wetness(0.9) })
  const c = me.dress(new THREE.MeshStandardMaterial(), { surface: dry })
  const d = me.dress(new THREE.MeshLambertMaterial())
  const e = me.dress(new THREE.MeshStandardMaterial())
  expect(key(a)).toBe(key(b))
  expect(key(a)).not.toBe(key(c))
  expect(key(d)).toBe(key(e))
  expect(new Set([key(a), key(c), key(d)]).size).toBe(3)
  const before = [a, b, c, d].map(key)
  a.color.set(0x00ff00)
  wet.uniforms!.wetness.value = 1
  a.roughness = 0.2
  expect([a, b, c, d].map(key)).toEqual(before)
  me.splice('snow', snow)
  const after = [a, b, c, d].map(key)
  after.forEach((k, i) => expect(k).not.toBe(before[i]))
  expect(key(a)).toBe(key(b))
  expect(key(a)).not.toBe(key(c))
  expect(key(me.dress(new THREE.MeshStandardMaterial(), { surface: wet }))).toBe(key(a))
})

test('a splice is registered once, and marks every dressed material for recompiling but a disposed one', () => {
  const me = render3d()
  const kept = me.dress(new THREE.MeshStandardMaterial())
  const gone = me.dress(new THREE.MeshStandardMaterial())
  gone.dispose()
  const [k, g] = [kept.version, gone.version]
  me.splice('snow', snow)
  expect(kept.version).toBeGreaterThan(k)
  expect(gone.version).toBe(g)
  expect(() => me.splice('snow', dry)).toThrow('render3d already has the splice snow')
})

// The shader three hands `onBeforeCompile` for a material of this type.
const shader = (lib: 'standard' | 'lambert') => ({
  vertexShader: THREE.ShaderLib[lib].vertexShader,
  fragmentShader: THREE.ShaderLib[lib].fragmentShader,
  uniforms: {} as Record<string, THREE.IUniform>,
}) as unknown as THREE.WebGLProgramParametersWithUniforms

test('a dressed program has vDressWorld with an instance\'s or a batch\'s own matrix counted, the surface before the splices, and the splices\' own uniform objects', () => {
  const me = render3d()
  me.splice('snow', snow)
  const wet = wetness(0.5)
  const m = me.dress(new THREE.MeshStandardMaterial(), { surface: wet })
  const s = shader('standard')
  m.onBeforeCompile(s, undefined as unknown as THREE.WebGLRenderer)
  const v = s.vertexShader, f = s.fragmentShader
  expect(v).toContain('#include <common>\nvarying vec3 vDressWorld;')
  expect(f).toContain('#include <common>\nvarying vec3 vDressWorld;')
  const world = v.slice(v.indexOf('#include <project_vertex>'))
  expect(world).toMatch(/^#include <project_vertex>\nvec4 dressWorld = vec4\( transformed, 1\.0 \);\n#ifdef USE_BATCHING\n {2}dressWorld = batchingMatrix \* dressWorld;\n#endif\n#ifdef USE_INSTANCING\n {2}dressWorld = instanceMatrix \* dressWorld;\n#endif\nvDressWorld = \( modelMatrix \* dressWorld \)\.xyz;/)
  // The surface's look first, the weather over it.
  expect(f).toContain(`#include <color_fragment>\n${wet.fragment!.color_fragment}\n${snow.fragment!.color_fragment}`)
  expect(f.indexOf('uniform float cover;')).toBeGreaterThan(f.indexOf('varying vec3 vDressWorld;'))
  expect(s.uniforms.wetness).toBe(wet.uniforms!.wetness)
  expect(s.uniforms.cover).toBe(snow.uniforms!.cover)
  // A chunk the shader does not include throws when the program is compiled.
  me.splice('tide', { vertex: { no_such_chunk: 'float tide;' } })
  expect(() => m.onBeforeCompile(shader('standard'), undefined as unknown as THREE.WebGLRenderer)).toThrow('render3d: tide goes after #include <no_such_chunk>, which this vertex shader does not include')
  const lambert = render3d().dress(new THREE.MeshLambertMaterial(), { surface: { fragment: { roughnessmap_fragment: 'x' } } })
  expect(() => lambert.onBeforeCompile(shader('lambert'), undefined as unknown as THREE.WebGLRenderer)).toThrow('render3d: the surface goes after #include <roughnessmap_fragment>, which this fragment shader does not include')
})

test('a `?chunk` goes after the chunk where the shader includes it, in the order the splices came, and is left out where it does not', () => {
  const me = render3d()
  me.splice('lamps', { fragment: { '?lights_fragment_begin': 'float lamps;' } })
  me.splice('glow', { fragment: { lights_fragment_begin: 'float glow;' } })
  const lit = me.dress(new THREE.MeshStandardMaterial())
  const s = shader('standard')
  lit.onBeforeCompile(s, undefined as unknown as THREE.WebGLRenderer)
  expect(s.fragmentShader).toContain('#include <lights_fragment_begin>\nfloat lamps;\nfloat glow;')
  // basic does not light: the optional chunk is left out, and no other splice of `lamps` is lost
  const only = render3d()
  only.splice('lamps', { fragment: { '?lights_fragment_begin': 'float lamps;', common: 'uniform float lampsOn;' } })
  const basic = only.dress(new THREE.MeshBasicMaterial())
  const b = { vertexShader: THREE.ShaderLib.basic.vertexShader, fragmentShader: THREE.ShaderLib.basic.fragmentShader, uniforms: {} } as unknown as THREE.WebGLProgramParametersWithUniforms
  basic.onBeforeCompile(b, undefined as unknown as THREE.WebGLRenderer)
  expect(b.fragmentShader).not.toContain('float lamps;')
  expect(b.fragmentShader).toContain('#include <common>\nvarying vec3 vDressWorld;\nuniform float lampsOn;')
})

test('a claim on the camera blocks a second owner until it is released, and only the owner releases it', () => {
  const me = render3d()
  const cutscene = {}, editor = {}
  expect(me.claimed()).toBeUndefined()
  expect(me.claim(cutscene)).toBe(true)
  expect(me.claim(cutscene)).toBe(true)
  expect(me.claim(editor)).toBe(false)
  me.release(editor)
  expect(me.claimed()).toBe(cutscene)
  me.release(cutscene)
  expect(me.claimed()).toBeUndefined()
  expect(me.claim(editor)).toBe(true)
  expect(me.claimed()).toBe(editor)
})

// One frame as a page draws it: its tick handed the step `n` the client is on and `between`, how far
// the page's clock is past it, then its draw. What is drawn is read off `drew`, handed in the middle of
// the draw: where each mesh and the camera stand, and the camera's turn as it is drawn.
type Seen = { camera: number[]; turn: number[]; meshes: Record<number, number[]> }
const watched = () => {
  const me = render3d()
  const seen: Seen[] = []
  me.drew(d => seen.push({ camera: d.camera, turn: me.camera!.quaternion.toArray(), meshes: d.meshes }))
  const frame = (n: number, between?: number) => {
    me.tick({ wire: { ...wire({ camera }).wire, n, between } } as any)
    me.afterTick()
    return seen.at(-1)!
  }
  me.tick(wire({ camera }))
  return { me, frame }
}
const turned = (a: number) => new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), a).toArray()

test('every mesh and the camera are drawn between where the last two steps left them, as far as the clock is past the step before, and put back once drawn', () => {
  const { me, frame } = watched()
  const box = new THREE.Mesh(new THREE.BoxGeometry())
  me.scene.add(box)
  const cam = me.camera!
  cam.position.set(0, 2, 0)
  frame(1, 0)
  box.position.set(10, 0, 0)
  cam.position.set(4, 2, 0)
  cam.quaternion.fromArray(turned(Math.PI / 2))
  const drawn = frame(2, 0.5)
  expect(drawn.meshes[box.id][0]).toBeCloseTo(5)
  expect(drawn.camera[0]).toBeCloseTo(2)
  drawn.turn.forEach((x, i) => expect(x).toBeCloseTo(turned(Math.PI / 4)[i]))
  expect(box.position.x).toBe(10)
  expect(cam.position.x).toBe(4)
  expect(frame(2, 0.75).meshes[box.id][0]).toBeCloseTo(7.5)
})

test('an object whose userData.teleport is true on a frame is drawn where it is put for the rest of that step, never between, and from there between steps again once it is false', () => {
  const { me, frame } = watched()
  const box = new THREE.Mesh(new THREE.BoxGeometry())
  me.scene.add(box)
  const cam = me.camera!
  cam.position.set(0, 1.7, 0)
  frame(1, 0)

  // The step the player goes through the door: the camera is put 40 metres on and turned a quarter,
  // with the flag up; the box beside it moves on as ever.
  cam.position.set(40, 1.7, 0)
  cam.quaternion.fromArray(turned(Math.PI / 2))
  cam.userData.teleport = true
  box.position.set(1, 0, 0)
  let drawn = frame(2, 0.25)
  expect(drawn.camera).toEqual([40, 1.7, 0])
  expect(drawn.turn).toEqual(turned(Math.PI / 2))
  expect(drawn.meshes[box.id][0]).toBeCloseTo(0.25)

  // The flag back down on the next frame of the same step: still where it was put, all that step.
  cam.userData.teleport = false
  drawn = frame(2, 0.75)
  expect(drawn.camera).toEqual([40, 1.7, 0])
  expect(drawn.turn).toEqual(turned(Math.PI / 2))
  expect(drawn.meshes[box.id][0]).toBeCloseTo(0.75)

  // The next step: between steps again, from where it was put.
  cam.position.set(41, 1.7, 0)
  box.position.set(2, 0, 0)
  drawn = frame(3, 0.5)
  expect(drawn.camera[0]).toBeCloseTo(40.5)
  expect(drawn.meshes[box.id][0]).toBeCloseTo(1.5)
})

test('a teleport on a frame that took several steps is drawn where it is put; a flag left up keeps its object out of the blend every step; and the flag changes nothing that is not flagged', () => {
  const { me, frame } = watched()
  const box = new THREE.Mesh(new THREE.BoxGeometry())
  const lamp = new THREE.Mesh(new THREE.BoxGeometry())
  me.scene.add(box, lamp)
  frame(1, 0)

  box.position.set(30, 0, 0)
  box.userData.teleport = true
  lamp.position.set(4, 0, 0)
  let drawn = frame(4, 0.5)
  expect(drawn.meshes[box.id]).toEqual([30, 0, 0])
  // Three steps in one frame: the lamp is drawn a step behind the clock, 2.5 of those 3 steps along.
  expect(drawn.meshes[lamp.id][0]).toBeCloseTo(4 * 2.5 / 3)
  box.userData.teleport = false

  // A flag left up: the lamp, moved from pool to pool, is drawn where it is set on every frame of
  // every step.
  lamp.userData.teleport = true
  for (const [n, x] of [[5, 8], [6, 12], [7, 20]]) {
    lamp.position.set(x, 0, 0)
    for (const between of [0, 0.3, 0.9]) expect(frame(n, between).meshes[lamp.id]).toEqual([x, 0, 0])
  }
  // The box, flag down, between steps all along.
  box.position.set(31, 0, 0)
  expect(frame(8, 0.5).meshes[box.id][0]).toBeCloseTo(30.5)
})

test('close disposes the composer, the renderer and its context, and removes the canvas', () => {
  const composed = vi.spyOn(EffectComposer.prototype, 'dispose')
  const { me, c } = page({ camera, ao })
  me.afterTick()
  me.close()
  expect(composed).toHaveBeenCalledTimes(1)
  expect(gpu.made[0].disposed).toBe(true)
  expect(gpu.made[0].lost).toBe(true)
  expect(c.removed).toBe(true)
  expect(me.renderer).toBeUndefined()
  const plain = page()
  plain.me.close()
  expect(plain.c.removed).toBe(true)
  expect(gpu.made[1].lost).toBe(true)
})
