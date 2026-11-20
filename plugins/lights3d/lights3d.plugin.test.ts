// lights3d on render3d with no canvas, in node: the splice it hands every dressed material, and the
// cells it fills as three calls the scene's `onBeforeRender`, read back as the splice reads them. Node
// has no WebGL, so the GLSL is read, not run; the cells are checked against every light's sphere at
// points all over the view.
import { expect, test, vi } from 'vitest'
import * as THREE from 'three'
import { render3d } from '#plugins/render3d/render3d.plugin.ts'
import { fogNoise, lights3d, type Settings } from './lights3d.plugin.ts'
import { ROW, TEXELS } from './lights3d.glsl.ts'
import { rectReach, type Areas } from './lights3d.areas.ts'

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

// Light `k`'s place in view space, its reach, colour, fall off and cone, read off the lights texture; its kind, and a
// rectangle's half width and half height.
function light(me: ReturnType<typeof lights3d>, k: number) {
  const data = (me.uniforms.uLights3dLights.value as THREE.DataTexture).image.data as Float32Array
  const row = Math.floor(k / ROW) * TEXELS, col = k % ROW
  const [a, b, s, q, e, h] = [0, 1, 2, 3, 4, 5].map(t => ((row + t) * ROW + col) * 4)
  return {
    at: new THREE.Vector3(data[a], data[a + 1], data[a + 2]), distance: data[a + 3],
    colour: [data[b], data[b + 1], data[b + 2]], decay: data[b + 3],
    aim: new THREE.Vector3(data[s], data[s + 1], data[s + 2]), cone: data[s + 3], penumbra: data[q],
    tiles: data[q + 2], kind: data[e + 3],
    halfHeight: new THREE.Vector3(data[h], data[h + 1], data[h + 2]),
  }
}

const AREAS: Areas = { size: 64, levels: 4, blur: 0.5, cutoff: 0.002, angle: 1.2, near: 0.05 }

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
  expect((me.uniforms.uLights3dLights.value as THREE.DataTexture).image.height).toBeGreaterThanOrEqual(15)
  const endless = Array.from({ length: me.count }, (_, k) => k).filter(k => light(me, k).distance === 0)
  expect(endless.length).toBeGreaterThan(0)
  const index = (me.uniforms.uLights3dIndex.value as THREE.DataTexture).image
  expect(index.width * index.height).toBeGreaterThanOrEqual(me.entries)
  // one of no reach reaches every cell
  expect(me.entries).toBeGreaterThanOrEqual(me.cells * endless.length)
  const { checked } = covered(me, cam, 5)
  expect(checked).toBeGreaterThan(4000)
})

test('a camera of a field of view of -90°, as a cube camera draws its faces through, finds every light reaching a point in its cell', () => {
  const { me, scene, draw } = page()
  strew(scene, 400, 13)
  const cube = new THREE.PerspectiveCamera(-90, 1, 0.1, 400)
  cube.position.set(100, 10, 100)
  cube.lookAt(100, 10, 0)
  cube.updateMatrixWorld()
  draw(cube)
  const { checked } = covered(me, cube, 17)
  expect(checked).toBeGreaterThan(200)
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

test('the point and spot lights it clusters are taken off three\'s own loop; a shadow\'s, a hidden one and one the camera does not see are not', () => {
  const { me, scene, draw, after } = page()
  const [lit, shadow, hidden, unseen] = [0, 1, 2, 3].map(() => scene.add(new THREE.PointLight(0xffffff, 10, 20)).children.at(-1) as THREE.PointLight)
  shadow.castShadow = true
  hidden.visible = false
  unseen.layers.set(3)
  const spot = new THREE.SpotLight(0xffffff, 10)
  scene.add(spot)
  const cam = camera()
  draw(cam)
  expect(me.count).toBe(2)
  expect([lit.layers.mask, spot.layers.mask]).toEqual([0, 0])
  expect([shadow.layers.mask, hidden.layers.mask, unseen.layers.mask]).toEqual([1, 1, 1 << 3])
  expect(me.uniforms.uLights3dOn.value).toBe(1)
  // after the scene is drawn the splice is off, so the overlay is lit by its own lights alone
  after(cam)
  expect(me.uniforms.uLights3dOn.value).toBe(0)
  // a light made to cast a shadow is three's again, its layers given back
  lit.castShadow = true
  draw(cam)
  expect([me.count, lit.layers.mask]).toEqual([1, 1])
})

test('a spot is handed on with three\'s own cone: its direction from its target in view space and the cosines of its angle and penumbra; a point light\'s cone takes in every direction', () => {
  const { me, scene, draw } = page()
  const lamp = new THREE.PointLight(0xffffff, 10, 20)
  const spot = new THREE.SpotLight(0xffffff, 10, 30, 0.6, 0.3, 2)
  lamp.position.set(60, 4, 10)
  spot.position.set(70, 9, 20)
  spot.target.position.set(75, 0, 28)
  scene.add(lamp, spot, spot.target)
  const cam = camera()
  draw(cam)
  const [p, s] = [light(me, 0), light(me, 1)]
  expect([p.cone, p.penumbra]).toEqual([-2, -1])
  // with no `shadows`, no light has tiles
  expect([p.tiles, s.tiles]).toEqual([0, 0])
  const aim = spot.position.clone().sub(spot.target.position).transformDirection(cam.matrixWorldInverse)
  expect(s.aim.toArray().map(x => +x.toFixed(5))).toEqual(aim.toArray().map(x => +x.toFixed(5)))
  expect([s.cone, s.penumbra]).toEqual([Math.fround(Math.cos(0.6)), Math.fround(Math.cos(0.6 * 0.7))])
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
    expect(after).toContain('getSpotAttenuation( l3S.w, l3P.x, dot( directLight.direction, l3S.xyz ) )')
    expect(s.fragmentShader).toContain('uniform highp sampler2D uLights3dLights;')
    for (const k of Object.keys(me.uniforms)) expect(s.uniforms[k]).toBe(me.uniforms[k])
  }
  const basic = plugins.render3d.dress(new THREE.MeshBasicMaterial())
  const s = shader('basic')
  basic.onBeforeCompile(s, undefined as never)
  expect(s.fragmentShader).not.toContain('RE_Direct')
})

test('with areas, a rectangle is taken off three\'s loop, handed on as kind 1 with its middle, reach, light and half sizes in view space, and found in the cell of every point it reaches; without, it is three\'s', () => {
  const { me, scene, draw } = page({ lights3d: { ...SET, areas: AREAS } })
  const panel = new THREE.RectAreaLight(0xff8040, 6, 4, 2)
  panel.position.set(80, 5, 40)
  panel.lookAt(80, 5, 0)
  const lamp = new THREE.PointLight(0xffffff, 10, 20)
  lamp.position.set(60, 4, 10)
  scene.add(panel, lamp)
  const cam = camera()
  draw(cam)
  expect(me.count).toBe(2)
  expect(panel.layers.mask).toBe(0)
  const k = [0, 1].find(i => light(me, i).kind === 1)!
  const r = light(me, k)
  const view = cam.matrixWorldInverse
  expect(r.at.toArray().map(x => +x.toFixed(3))).toEqual(panel.position.clone().applyMatrix4(view).toArray().map(x => +x.toFixed(3)))
  expect(r.distance).toBeCloseTo(rectReach(panel, AREAS), 2)
  expect(r.colour).toEqual([panel.color.r, panel.color.g, panel.color.b].map(c => Math.fround(c * 6)))
  // its half width (where a spot's aim goes) along its own x, its half height along its own y, turned into the view as three's own are
  const turn = new THREE.Matrix4().extractRotation(new THREE.Matrix4().multiplyMatrices(view, panel.matrixWorld))
  expect(r.aim.toArray().map(x => +x.toFixed(4))).toEqual(new THREE.Vector3(2, 0, 0).applyMatrix4(turn).toArray().map(x => +x.toFixed(4)))
  expect(r.halfHeight.toArray().map(x => +x.toFixed(4))).toEqual(new THREE.Vector3(0, 1, 0).applyMatrix4(turn).toArray().map(x => +x.toFixed(4)))
  // no picture: its picture's first layer is −1
  expect(r.decay).toBe(-1)
  expect(light(me, 1 - k).kind).toBe(0)
  const { checked } = covered(me, cam, 23)
  expect(checked).toBeGreaterThan(100)
  // a scene with no areas leaves a rectangle to three, as it was
  const plain = page()
  const other = new THREE.RectAreaLight(0xffffff, 6, 4, 2)
  plain.scene.add(other)
  plain.draw(camera())
  expect([plain.me.count, other.layers.mask]).toEqual([0, 1])
})

test('with areas, the lit materials take the rectangles\' light where three\'s LTC code is, and the glow\'s cells in every one', () => {
  const { plugins, me } = page({ lights3d: { ...SET, areas: AREAS } })
  for (const lib of ['standard', 'physical', 'lambert'] as const) {
    const m = plugins.render3d.dress(new THREE.MeshStandardMaterial())
    const s = shader(lib)
    m.onBeforeCompile(s, undefined as never)
    // the area lights' code goes in after three's LTC functions, inside `#ifdef STANDARD`, so a lambert
    // program has it written and compiled out
    expect(s.fragmentShader).toContain('lights3dRect( geometryNormal, geometryViewDir, geometryPosition, l3Inv, l3Rect, l3B.w )')
    expect(s.fragmentShader).toContain('for ( int j = 0; j < uLights3dGlowCells.y; j ++ )')
    if (lib !== 'lambert') expect(s.fragmentShader.indexOf('vec3 lights3dRect(')).toBeGreaterThan(s.fragmentShader.indexOf('vec3 LTC_Evaluate('))
    for (const k of ['uLights3dPictures', 'uLights3dLtc', 'uLights3dGlowmap']) expect(s.uniforms[k]).toBe(me.uniforms[k])
  }
  // without areas, none of it
  const plain = page()
  const m = plain.plugins.render3d.dress(new THREE.MeshStandardMaterial())
  const s = shader('standard')
  m.onBeforeCompile(s, undefined as never)
  expect(s.fragmentShader).not.toContain('lights3dRect')
  expect(s.fragmentShader).not.toContain('uLights3dGlowmap')
})

test('the fog\'s noise is the same on every page, spans the whole of 0 to 255, and repeats with no seam along each axis', () => {
  const a = fogNoise(32), b = fogNoise(32)
  expect(a.bytes).toEqual(b.bytes)
  expect(Math.min(...a.bytes)).toBe(0)
  expect(Math.max(...a.bytes)).toBe(255)
  // across the wrap, neighbours differ no more than neighbours inside do
  const n = a.size, at = (x: number, y: number, z: number) => a.bytes[(z * n + y) * n + x]
  let inside = 0, across = 0
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    inside = Math.max(inside, Math.abs(at(0, i, j) - at(1, i, j)), Math.abs(at(i, 0, j) - at(i, 1, j)), Math.abs(at(i, j, 0) - at(i, j, 1)))
    across = Math.max(across, Math.abs(at(n - 1, i, j) - at(0, i, j)), Math.abs(at(i, n - 1, j) - at(i, 0, j)), Math.abs(at(i, j, n - 1) - at(i, j, 0)))
  }
  expect(across).toBeLessThanOrEqual(inside * 1.5 + 1)
})

test('a fog noise or height it cannot draw throws on the first tick, naming the number', () => {
  const fog = { density: 0.05, colour: '#000000', steps: 32, g: 0.3, far: 50, resolution: 0.5, blend: 0.1 }
  const bad = (more: object) => () => page({ lights3d: { ...SET, fog: { ...fog, ...more } } })
  expect(bad({ blend: 0 })).toThrow('lights3d fog blend 0 is not above 0 and no more than 1')
  expect(bad({ noise: { size: 0, layers: 2, strength: 1, wind: [0, 0, 0] } })).toThrow('lights3d fog noise size 0 is not above 0')
  expect(bad({ noise: { size: 10, layers: 5, strength: 1, wind: [0, 0, 0] } })).toThrow('lights3d fog noise layers 5 is not a whole number from 1 to 4')
  expect(bad({ noise: { size: 10, layers: 2, strength: 2, wind: [0, 0, 0] } })).toThrow('lights3d fog noise strength 2 is not from 0 to 1')
  expect(bad({ noise: { size: 10, layers: 2, strength: 1, wind: [0, 0] } })).toThrow('lights3d fog noise wind [0,0] is not [x, y, z]')
  expect(bad({ height: { floor: 0, thinning: 0 } })).toThrow('lights3d fog height thinning 0 is not above 0')
})

test('a lights3d it cannot cut the frame by throws on its first tick, naming what is wrong', () => {
  const bad = (s: unknown) => () => page({ lights3d: s })
  expect(bad(undefined)).toThrow('the scene names lights3d but gives no world.lights3d')
  expect(bad({ grid: [16], slices: 24 })).toThrow('lights3d grid [16] is not [across, up], two whole numbers above 0')
  expect(bad({ grid: [16, 0.5], slices: 24 })).toThrow('lights3d grid [16,0.5] is not [across, up], two whole numbers above 0')
  expect(bad({ grid: [16, 9], slices: 0 })).toThrow('lights3d slices 0 is not a whole number above 0')
  expect(bad({ grid: [16, 9], slices: 24, shadows: { atlas: 4096, tile: 300, bias: 0, normalBias: 0 } })).toThrow('lights3d shadows atlas 4096 is not a whole number of tiles of 300')
  expect(bad({ grid: [16, 9], slices: 24, shadows: { atlas: 4096, tile: 256, bias: -1, normalBias: 0 } })).toThrow('lights3d shadows bias -1 and normalBias 0 are not numbers of 0 or more')
  expect(() => lights3d().tick({ wire: { scene: { world: { lights3d: SET } } } } as never)).toThrow('lights3d needs render3d, which this scene does not name')
})
