// lights3d on render3d with no canvas, in node: the splice it hands every dressed material, and the
// cells it fills as three calls the scene's `onBeforeRender`, read back as the splice reads them. Node
// has no WebGL, so the GLSL is read, not run; the cells are checked against every light's sphere at
// points all over the view.
import { expect, test, vi } from 'vitest'
import * as THREE from 'three'
import { render3d } from '#plugins/render3d/render3d.plugin.ts'
import { lights3d, type Settings } from './lights3d.plugin.ts'

const SET: Settings = { grid: [16, 9], slices: 24 }
const W = 1280, H = 720

function page(world: Record<string, unknown> = { lights3d: SET }) {
  const plugins: any = { wire: { rows: [], scene: { world, prefabs: {} } }, render3d: render3d() }
  const me = lights3d()
  me.tick(plugins)
  const scene = plugins.render3d.scene as THREE.Scene
  const renderer = { getDrawingBufferSize: (v: THREE.Vector2) => v.set(W, H) } as unknown as THREE.WebGLRenderer
  // the scene drawn through `camera`, as three calls the hooks round it
  const draw = (camera: THREE.Camera, target: THREE.RenderTarget | null = null) => {
    scene.updateMatrixWorld()
    camera.updateMatrixWorld()
    scene.onBeforeRender(renderer, scene, camera, target as never, undefined as never, undefined as never)
  }
  const after = (camera: THREE.Camera) => scene.onAfterRender(renderer, scene, camera, undefined as never, undefined as never, undefined as never)
  return { plugins, me, scene, draw, after }
}

// A shader of three's for a material, as `onBeforeCompile` is handed it.
const shader = (lib: keyof typeof THREE.ShaderLib) => ({
  vertexShader: THREE.ShaderLib[lib].vertexShader,
  fragmentShader: THREE.ShaderLib[lib].fragmentShader,
  uniforms: {} as Record<string, THREE.IUniform>,
}) as unknown as THREE.WebGLProgramParametersWithUniforms

// A seeded roll, so the lights and points stand the same every run.
const roll = (seed: number) => () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646

const camera = () => {
  const c = new THREE.PerspectiveCamera(62, W / H, 0.3, 12000)
  c.position.set(40, 6, -30)
  c.lookAt(120, 2, 80)
  c.updateMatrixWorld()
  return c
}

// The lights the splice would loop over at view-space point `p`, read off the textures as it reads them.
function looped(me: ReturnType<typeof lights3d>, p: THREE.Vector3, cam: THREE.PerspectiveCamera) {
  const u = me.uniforms
  const g = u.uLights3dGrid.value as THREE.Vector3, screen = u.uLights3dScreen.value as THREE.Vector2
  const ndc = p.clone().applyMatrix4(cam.projectionMatrix)
  const frag = [((ndc.x + 1) / 2) * screen.x, ((ndc.y + 1) / 2) * screen.y]
  const depth = Math.max(-p.z, u.uLights3dNear.value)
  const at = [(frag[0] / screen.x) * g.x, (frag[1] / screen.y) * g.y, Math.log(depth / u.uLights3dNear.value) * u.uLights3dScale.value]
  const cell = at.map((a, i) => Math.min([g.x, g.y, g.z][i] - 1, Math.max(0, Math.floor(a))))
  const c = cell[0] + g.x * (cell[1] + g.y * cell[2])
  const cells = (u.uLights3dCells.value as THREE.DataTexture).image.data as Float32Array
  const index = (u.uLights3dIndex.value as THREE.DataTexture).image.data as Float32Array
  const [start, count] = [cells[c * 2], cells[c * 2 + 1]]
  return [...index.slice(start, start + count)]
}

// Light `k`'s place in view space, its reach, colour and fall off, read off the lights texture.
function light(me: ReturnType<typeof lights3d>, k: number) {
  const data = (me.uniforms.uLights3dLights.value as THREE.DataTexture).image.data as Float32Array
  const row = Math.floor(k / 1024) * 2, col = k % 1024
  const a = (row * 1024 + col) * 4, b = ((row + 1) * 1024 + col) * 4
  return { at: new THREE.Vector3(data[a], data[a + 1], data[a + 2]), distance: data[a + 3], colour: [data[b], data[b + 1], data[b + 2]], decay: data[b + 3] }
}

// `n` lamps strewn over the view, each `reach` metres or of no reach where the roll says
function strew(scene: THREE.Scene, n: number, seed: number, endless = 0) {
  const die = roll(seed), made: THREE.PointLight[] = []
  for (let k = 0; k < n; k++) {
    const l = new THREE.PointLight(0xffaa55, 20 + die() * 80, die() < endless ? 0 : 5 + die() * 60, 1 + die())
    l.position.set(-200 + die() * 600, die() * 30, -200 + die() * 600)
    scene.add(l)
    made.push(l)
  }
  return made
}

// Every light reaching a point is in its cell, at points all over the view and at every depth.
function covered(me: ReturnType<typeof lights3d>, cam: THREE.PerspectiveCamera, seed: number) {
  const die = roll(seed)
  let checked = 0, inCell = 0
  for (let q = 0; q < 4000; q++) {
    const depth = 0.3 * Math.pow(1500 / 0.3, die())
    const ndc = new THREE.Vector3(die() * 2 - 1, die() * 2 - 1, 0)
    const p = new THREE.Vector3(ndc.x, ndc.y, 0.5).unproject(cam).applyMatrix4(cam.matrixWorldInverse)
    p.multiplyScalar(depth / -p.z)
    const list = new Set(looped(me, p, cam))
    inCell += list.size
    for (let k = 0; k < me.count; k++) {
      const l = light(me, k)
      if (l.distance > 0 && l.at.distanceTo(p) >= l.distance) continue
      expect(list.has(k), `light ${k} reaches the point ${p.toArray()} and is not in its cell`).toBe(true)
      checked++
    }
  }
  return { checked, inCell: inCell / 4000 }
}

test('every light reaching a point is in the cell the splice finds for it, and a cell holds a few of them', () => {
  const { me, scene, draw } = page()
  const lamps = strew(scene, 600, 7)
  const cam = camera()
  draw(cam)
  expect(me.count).toBe(600)
  // each light as three would hand it: its place in view space, reach, colour times intensity, fall off
  const l = light(me, 3)
  expect(l.at.toArray().map(x => +x.toFixed(3))).toEqual(lamps[3].position.clone().applyMatrix4(cam.matrixWorldInverse).toArray().map(x => +x.toFixed(3)))
  expect([l.distance, l.decay]).toEqual([Math.fround(lamps[3].distance), Math.fround(lamps[3].decay)])
  expect(l.colour).toEqual([lamps[3].color.r, lamps[3].color.g, lamps[3].color.b].map(c => Math.fround(c * lamps[3].intensity)))
  const { checked, inCell } = covered(me, cam, 11)
  expect(checked).toBeGreaterThan(1000)
  // the cells cull: a point's cell holds a small share of the lights
  expect(inCell).toBeLessThan(600 / 10)
})

test('a light of no reach is in every cell, and past 1024 lights the lights and the list grow and are still found', () => {
  const { me, scene, draw } = page()
  strew(scene, 2600, 3, 0.002)
  const cam = camera()
  draw(cam)
  expect(me.count).toBe(2600)
  expect((me.uniforms.uLights3dLights.value as THREE.DataTexture).image.height).toBeGreaterThanOrEqual(6)
  const endless = Array.from({ length: me.count }, (_, k) => k).filter(k => light(me, k).distance === 0)
  expect(endless.length).toBeGreaterThan(0)
  const index = (me.uniforms.uLights3dIndex.value as THREE.DataTexture).image
  expect(index.width * index.height).toBeGreaterThanOrEqual(me.entries)
  // one of no reach reaches every cell
  expect(me.entries).toBeGreaterThanOrEqual(me.cells * endless.length)
  const { checked } = covered(me, cam, 5)
  expect(checked).toBeGreaterThan(4000)
})

test('the cells follow the camera the scene is drawn through, and the size of the target it draws into', () => {
  const { me, scene, draw } = page()
  strew(scene, 300, 9)
  const cam = camera()
  draw(cam)
  covered(me, cam, 1)
  cam.position.set(-120, 40, 200)
  cam.lookAt(0, 0, 0)
  cam.fov = 40
  cam.updateProjectionMatrix()
  draw(cam, new THREE.WebGLRenderTarget(640, 400))
  expect((me.uniforms.uLights3dScreen.value as THREE.Vector2).toArray()).toEqual([640, 400])
  covered(me, cam, 2)
})

test('the point lights it clusters are taken off three\'s own loop; a shadow\'s, a hidden one and one the camera does not see are not', () => {
  const { me, scene, draw, after } = page()
  const [lit, shadow, hidden, unseen] = [0, 1, 2, 3].map(() => scene.add(new THREE.PointLight(0xffffff, 10, 20)).children.at(-1) as THREE.PointLight)
  shadow.castShadow = true
  hidden.visible = false
  unseen.layers.set(3)
  const spot = new THREE.SpotLight(0xffffff, 10)
  scene.add(spot)
  const cam = camera()
  draw(cam)
  expect(me.count).toBe(1)
  expect(lit.layers.mask).toBe(0)
  expect([shadow.layers.mask, hidden.layers.mask, unseen.layers.mask, spot.layers.mask]).toEqual([1, 1, 1 << 3, 1])
  expect(me.uniforms.uLights3dOn.value).toBe(1)
  // after the scene is drawn the splice is off, so the overlay is lit by its own lights alone
  after(cam)
  expect(me.uniforms.uLights3dOn.value).toBe(0)
  // a light made to cast a shadow is three's again, its layers given back
  lit.castShadow = true
  draw(cam)
  expect([me.count, lit.layers.mask]).toEqual([0, 1])
})

test('the scene\'s own hooks still run, and closing gives back the hooks, every light\'s layers and the textures', () => {
  const plugins: any = { wire: { rows: [], scene: { world: { lights3d: SET }, prefabs: {} } }, render3d: render3d() }
  const scene = plugins.render3d.scene as THREE.Scene
  const before = vi.fn(), after = vi.fn()
  scene.onBeforeRender = before
  scene.onAfterRender = after
  const me = lights3d()
  me.tick(plugins)
  const l = scene.add(new THREE.PointLight(0xffffff, 10, 20)).children.at(-1) as THREE.PointLight
  l.layers.set(2)
  const renderer = { getDrawingBufferSize: (v: THREE.Vector2) => v.set(W, H) } as never
  const cam = camera()
  cam.layers.enable(2)
  scene.onBeforeRender(renderer, scene, cam, null as never, undefined as never, undefined as never)
  scene.onAfterRender(renderer, scene, cam, undefined as never, undefined as never, undefined as never)
  expect(before).toHaveBeenCalledTimes(1)
  expect(after).toHaveBeenCalledTimes(1)
  expect(l.layers.mask).toBe(0)
  const textures = ['uLights3dLights', 'uLights3dCells', 'uLights3dIndex'].map(k => me.uniforms[k].value as THREE.DataTexture)
  const freed = vi.fn()
  for (const t of textures) t.addEventListener('dispose', freed)
  me.close()
  expect(l.layers.mask).toBe(1 << 2)
  expect(scene.onBeforeRender).toBe(before)
  expect(scene.onAfterRender).toBe(after)
  expect(freed).toHaveBeenCalledTimes(3)
})

test('every dressed material that lights loops over its cell\'s lights after three\'s own; one that does not light is left alone', () => {
  const { plugins, me } = page()
  for (const lib of ['standard', 'physical', 'lambert', 'phong', 'toon'] as const) {
    const m = plugins.render3d.dress(new THREE.MeshStandardMaterial())
    const s = shader(lib)
    m.onBeforeCompile(s, undefined as never)
    const after = s.fragmentShader.slice(s.fragmentShader.indexOf('#include <lights_fragment_begin>'))
    expect(after.indexOf('RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );')).toBeLessThan(after.indexOf('#include <lights_fragment_maps>'))
    expect(after).toContain('getDistanceAttenuation( length( l3V ), l3A.w, l3B.w )')
    expect(s.fragmentShader).toContain('uniform highp sampler2D uLights3dLights;')
    for (const k of Object.keys(me.uniforms)) expect(s.uniforms[k]).toBe(me.uniforms[k])
  }
  const basic = plugins.render3d.dress(new THREE.MeshBasicMaterial())
  const s = shader('basic')
  basic.onBeforeCompile(s, undefined as never)
  expect(s.fragmentShader).not.toContain('RE_Direct')
})

test('a lights3d it cannot cut the frame by throws on its first tick, naming what is wrong', () => {
  const bad = (s: unknown) => () => page({ lights3d: s })
  expect(bad(undefined)).toThrow('the scene names lights3d but gives no world.lights3d')
  expect(bad({ grid: [16], slices: 24 })).toThrow('lights3d grid [16] is not [across, up], two whole numbers above 0')
  expect(bad({ grid: [16, 0.5], slices: 24 })).toThrow('lights3d grid [16,0.5] is not [across, up], two whole numbers above 0')
  expect(bad({ grid: [16, 9], slices: 0 })).toThrow('lights3d slices 0 is not a whole number above 0')
  expect(() => lights3d().tick({ wire: { scene: { world: { lights3d: SET } } } } as never)).toThrow('lights3d needs render3d, which this scene does not name')
})
