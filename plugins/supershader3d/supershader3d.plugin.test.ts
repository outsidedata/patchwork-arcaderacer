// supershader3d on a page of the test's own, through the loopback as `index.html` makes one, with
// render3d handed a canvas stand-in and no renderer: the looks file of the test's own, three
// materials (a stone, a cobbled path with a shadow of its own, a pane), lands and the plugin makes one
// material a call, dressed by render3d and keyed by its call, every setting a texel of one float
// table, read and changed by name, and none a uniform, the looks' clock on by the engine's dt each tick, the shared noise and random textures the file needs, a material's number and call by its name, and the
// `all` shader with its varyings as plain globals; the pictures are asked of the loader and `ready`
// once they have landed. Then the patch itself on three's own physical shader: every chunk the looks
// reach into is there, swapped to read the look, and three's chunks still hold the lines the swaps
// expect. A file whose looks read the course table, in a scene naming no plugin that delivers it,
// throws naming the word and the key; a picture that is no texture entry throws naming it.
import { afterAll, expect, test, vi } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import * as THREE from 'three'
import { boot, type Scene } from '#engine/engine.ts'
import { accept, link, load, manager, view } from '#addons/scenemanager/scenemanager.addon.ts'
import { loopback } from '#addons/loopback/loopback.addon.ts'
import { scenemanager } from '#plugins/scenemanager/scenemanager.sim.ts'
import { written } from '#plugins/loader/loader.sim.ts'
import { chunks, free, noiseBytes, patch, randomBytes, RAND, type Looks } from './supershader3d.plugin.ts'

const DT = 1 / 60
;(globalThis as any).addEventListener = () => {}
;(globalThis as any).removeEventListener = () => {}
let clock = 0
vi.spyOn(performance, 'now').mockImplementation(() => clock)

// A preamble of the shape compose.js writes, for the looks `ids`, with a shadow for those in `shadows`.
const BASE = 'flat varying float vLookId;\nvarying vec3 vLookInfo;\nvarying vec2 vLookUv;\nvarying vec3 vLookWorld;\nvarying vec3 vLookWN;\nvarying vec3 vS0;\nvarying vec3 vS1;\nvarying vec4 vS2;\nvarying vec2 vS3;\n#define s0 vS0\n#define s1 vS1\n#define s2 vS2\n#define s3 vS3\nuniform float lookView;\nuniform float lookDebug;\nvec2 lookGx, lookGy;\n' +
  'struct Look { vec3 colour; float rough; float metal; float height; vec3 nts; vec3 normal; bool ownNormal; float ao; float aoDirect; float alpha; vec3 glow; float clearcoat; float clearcoatRough; vec3 sheen; float sheenRough; float iridescence; float iridIor; float iridThick; float transmission; float thickness; vec3 attColour; float attDist; float ior; float dispersion; };\n' +
  'Look lookStart() { Look k; k.colour = vec3(0.5); k.rough = 0.8; return k; }\n' +
  'vec3 kitBump(vec3 pos, vec3 n, float h, float fd) { return n; }\nvec3 lookPerturb(vec3 n, vec3 nts, float fd) { return n; }\n'
const shaderOf = (ids: number[], shadows: number[], features: Record<string, boolean> = {}) => ({
  ids,
  fragmentPars: `uniform highp sampler2D lookSettings;\n${BASE}float p_size;\nvec3 p_grey;\n${ids.map(id => `void look_${id}(inout Look k) {\n${id === 1 ? '  p_size = texelFetch(lookSettings, ivec2(0, 1), 0).r;\n  p_grey = texelFetch(lookSettings, ivec2(1, 1), 0).rgb;\n' : ''}  k.colour = vec3(${id}.0);\n}\n`).join('')}` +
    `${shadows.map(id => `float lookShadow_${id}(vec3 Lview) {\n  return 0.5;\n}\n`).join('')}` +
    `Look lookRun(int id) {\n  Look k = lookStart();\n  switch (id) {\n${ids.map(id => `    case ${id}: look_${id}(k); break;`).join('\n')}\n  }\n  return k;\n}\n` +
    `float lookShadow(int id, vec3 Lview) {\n  ${shadows.length ? `switch (id) {\n${shadows.map(id => `    case ${id}: return lookShadow_${id}(Lview);`).join('\n')}\n  }` : ''}\n  return 1.0;\n}\n`,
  features: { clearcoat: false, sheen: false, iridescence: false, dispersion: false, transmission: false, ...features },
})
const LOOKS: Looks = {
  about: 'a test',
  picture: 64,
  materials: [
    { name: 'stone', look: 'rock', call: 'solid', colour: [0.5, 0.5, 0.5] },
    { name: 'path', look: 'cobble', call: 'relief', colour: [0.4, 0.4, 0.4] },
    { name: 'pane', look: 'glass', call: 'seeThrough', colour: [0.9, 0.9, 1] },
  ],
  vertexPars: 'attribute float lookId;\nattribute vec3 lookInfo;\nattribute vec3 s0;\nattribute vec3 s1;\nattribute vec4 s2;\nattribute vec2 s3;\nflat varying float vLookId;\nvarying vec3 vLookInfo;\nvarying vec2 vLookUv;\nvarying vec3 vLookWorld;\nvarying vec3 vLookWN;\nvarying vec3 vS0;\nvarying vec3 vS1;\nvarying vec4 vS2;\nvarying vec2 vS3;\n',
  vertexMain: 'vLookId = lookId;\nvLookInfo = lookInfo;\nvLookUv = uv;\nvLookWorld = (modelMatrix * vec4(position, 1.0)).xyz;\nvLookWN = normalize(mat3(modelMatrix) * normal);\nvS0 = s0;\nvS1 = s1;\nvS2 = s2;\nvS3 = s3;\n',
  calls: {
    solid: shaderOf([0], []),
    relief: shaderOf([1], [1]),
    seeThrough: shaderOf([2], [], { transmission: true }),
    all: shaderOf([0, 1, 2], [1], { transmission: true }),
  },
  settings: { width: 2, materials: [[], [{ name: 'size', type: 'float', value: 0.15 }, { name: 'grey', type: 'vec3', value: [0.2, 0.3, 0.4] }], []] },
  needs: ['noise', 'random'],
  pictures: [{ asset: 'rockColour', file: 'Rock007_4K_Color.webp', set: 'Rock007_4K-JPG', source: 'Rock007_4K_Color.jpg', colour: true }],
}
const LOOKS_URL = '/supershader3d-test/main.looks.json'
written(LOOKS_URL, JSON.stringify(LOOKS))
const COURSED_URL = '/supershader3d-test/coursed.looks.json'
written(COURSED_URL, JSON.stringify({ ...LOOKS, needs: ['courses'] }))
// The same looks baked with their pictures as one GPU-compressed stack.
const STACK = { asset: 'rockStack', file: 'main.pictures.ktx2', means: [0.31] }
const STACKED_URL = '/supershader3d-test/stacked.looks.json'
written(STACKED_URL, JSON.stringify({ ...LOOKS, stack: STACK }))

const sceneOf = (looks: string, assets: Record<string, unknown>, world: Record<string, unknown> = {}): Scene => ({
  world: {
    loader: { assets: { looks: { type: 'json', url: looks, preload: true }, ...assets } },
    supershader3d: { looks: 'looks', ...world },
  },
  prefabs: { engine: { dt: DT, width: 320, height: 200 }, scenemanager: { out: {} }, loader: {} },
  actors: [{ is: 'scenemanager' }, { is: 'loader' }],
  plugins: ['loader', 'scenemanager', 'supershader3d', 'render3d'],
  seats: 1,
})
const scenes: Record<string, Scene> = {
  town: sceneOf(LOOKS_URL, { rockColour: { type: 'texture', url: '/supershader3d-test/rock.png', wrap: 'repeat' } }),
  unpictured: sceneOf(LOOKS_URL, { rockColour: { type: 'json', url: LOOKS_URL } }),
  coursed: sceneOf(COURSED_URL, { rockColour: { type: 'texture', url: '/supershader3d-test/rock.png' } }),
  stacked: sceneOf(STACKED_URL, { rockStack: { type: 'texture', url: '/supershader3d-test/main.pictures.ktx2', preload: true } }),
  misstacked: sceneOf(STACKED_URL, { rockStack: { type: 'texture', url: '/supershader3d-test/main.pictures.png' } }),
}
const dir = mkdtempSync(join(tmpdir(), 'supershader3d-plugin-'))
afterAll(() => rmSync(dir, { recursive: true }))
const from = (p: string) => JSON.stringify(new URL(p, import.meta.url).pathname)
for (const [name, s] of Object.entries(scenes)) {
  writeFileSync(join(dir, `${name}.scene.json`), JSON.stringify(s))
  writeFileSync(join(dir, `${name}.sim.ts`), `
import { scenemanager } from ${from('../scenemanager/scenemanager.sim.ts')}
import { loader } from ${from('../loader/loader.sim.ts')}
import file from './${name}.scene.json' with { type: 'json' }
export const sim = { scenemanager, loader }
export const scene = file
`)
}
const home = pathToFileURL(dir + '/').href

async function open(entry: string) {
  const top: Scene = {
    world: {},
    plugins: ['scenemanager'],
    seats: 1,
    prefabs: { engine: { dt: DT }, scenemanager: { scenes: { [entry]: { file: `${entry}.scene.json`, suspend: false } }, dt: DT, entry, port: 0 } },
    actors: [{ is: 'scenemanager' }],
  }
  const truth = boot(structuredClone(top), { scenemanager })
  await load(truth, home)
  const surface = (s: Scene) => ({ addEventListener: () => {}, style: {} as any, width: s.prefabs.engine.width, height: s.prefabs.engine.height, remove() {} })
  const page = view(link(loopback(accept(manager(truth)))), top, home, (me, s) => { me.plugins.render3d.canvas = surface(s) })
  const frames = async (k: number) => { for (let i = 0; i < k; i++) { truth.step(DT); clock += DT * 1000; await page.frame() } }
  return { page, frames }
}

test('once the file lands, one material a call, dressed and keyed by its call, every setting a uniform, the textures the file needs, and each material by name', async () => {
  const { page, frames } = await open('town')
  await frames(3)
  const s = page.client!.plugins.supershader3d
  expect(s.looks()).toEqual(LOOKS)
  const solid = s.material('solid'), relief = s.material('relief'), pane = s.material('seeThrough')
  expect(solid).toBeInstanceOf(THREE.MeshPhysicalMaterial)
  expect([solid!.transparent, solid!.depthWrite, solid!.transmission]).toEqual([false, true, 0])
  expect([pane!.transparent, pane!.depthWrite, pane!.transmission]).toEqual([true, false, 1])
  expect(relief!.name).toBe('supershader3d relief')
  // dressed: render3d keys the program by its splices, and the call keys it on top
  const keys = [solid, relief, pane].map(m => m!.customProgramCacheKey())
  expect(new Set(keys).size).toBe(3)
  expect(keys[0]).toMatch(/\|supershader3d solid [0-9a-z]+$/)
  // the settings one float table, a row a material, and no setting a uniform
  const table = s.uniforms.lookSettings.value as THREE.DataTexture
  expect(table).toBeInstanceOf(THREE.DataTexture)
  expect([table.image.width, table.image.height, table.type, table.magFilter, table.minFilter, table.generateMipmaps]).toEqual([2, 3, THREE.FloatType, THREE.NearestFilter, THREE.NearestFilter, false])
  const texels = Array.from(table.image.data as Float32Array, v => Math.round(v * 1000) / 1000)
  expect(texels).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 0.15, 0, 0, 0, 0.2, 0.3, 0.4, 0, 0, 0, 0, 0, 0, 0, 0, 0])
  expect(Object.keys(s.uniforms).filter(k => /^L\d+_/.test(k))).toEqual([])
  expect(s.setting('path', 'size')).toBeCloseTo(0.15, 6)
  expect((s.setting('path', 'grey') as number[]).map(v => Math.round(v * 1000) / 1000)).toEqual([0.2, 0.3, 0.4])
  // a setting changed is its texel, for the next frame, and the file is left as it was
  const version = table.version
  s.set('path', 'size', 0.3)
  s.set('path', 'grey', [1, 0.5, 0])
  expect(table.version).toBeGreaterThan(version)
  expect(s.setting('path', 'size')).toBeCloseTo(0.3, 6)
  expect(s.setting('path', 'grey')).toEqual([1, 0.5, 0])
  expect(s.looks()!.settings.materials[1][0].value).toBe(0.15)
  expect(() => s.set('path', 'size', [1, 2, 3])).toThrow('supershader3d: material path\'s setting size is a float, and was handed [1,2,3]')
  expect(() => s.set('path', 'grey', 1)).toThrow('supershader3d: material path\'s setting grey is a vec3, and was handed 1')
  expect(() => s.setting('path', 'funk')).toThrow('supershader3d: material path (look cobble) has no setting funk; it has size, grey')
  expect(() => s.setting('stone', 'size')).toThrow('supershader3d: material stone (look rock) has no setting size; it has none')
  expect(() => s.setting('funkystone', 'size')).toThrow('supershader3d: the looks file holds no material funkystone')
  expect(s.uniforms.csNoise.value).toBeInstanceOf(THREE.DataTexture)
  expect(s.uniforms.cbRand.value.image.width).toBe(RAND)
  expect(s.uniforms.lookView.value).toBe(0)
  // the looks' clock: on by the engine's dt each tick once the file has landed
  const time = s.uniforms.lookTime.value as number
  expect(time).toBeGreaterThanOrEqual(0)
  await frames(4)
  expect(s.uniforms.lookTime.value).toBeCloseTo(time + 4 * DT, 9)
  expect([s.idOf('stone'), s.idOf('path'), s.idOf('pane'), s.idOf('funkystone')]).toEqual([0, 1, 2, undefined])
  expect([s.callOf('stone'), s.callOf('path'), s.callOf('pane'), s.callOf('funkystone')]).toEqual(['solid', 'relief', 'seeThrough', undefined])
  // the one shader of every material, its varyings plain globals for a program that sets them
  const all = s.glsl()!
  expect(all).not.toMatch(/varying/)
  expect(all).toContain('float vLookId;')
  expect(all).toContain('vec2 vLookUv;')
  expect(all).toContain('vec4 vS2;\nvec2 vS3;\n#define s0 vS0')
  expect(all).toContain('case 2: look_2(k); break;')
  expect(all).toContain('case 1: return lookShadow_1(Lview);')
  // the picture asked of the loader, and ready once it has landed; no renderer, so no stack
  await frames(3)
  expect(s.ready()).toBe(true)
  expect(page.client!.plugins.loader.ready('rockColour')).toBe(true)
  expect(s.uniforms.lookPictures.value).toBeNull()
  let disposed = false
  table.addEventListener('dispose', () => { disposed = true })
  page.close()
  expect(s.material('solid')).toBeUndefined()
  expect(disposed).toBe(true)
})

test('the patch puts the looks into three\'s physical shader: the vertex side, the preamble before main, and every chunk swapped to read the look', () => {
  const swaps = chunks(THREE)
  const shader = { vertexShader: THREE.ShaderLib.physical.vertexShader, fragmentShader: THREE.ShaderLib.physical.fragmentShader }
  patch(shader, LOOKS, LOOKS.calls.relief!, swaps)
  // the clock declared ahead of the looks' vertex side, so a look's own vertex code reads it
  expect(shader.vertexShader).toContain('#include <common>\nuniform float lookTime;\nattribute float lookId;')
  expect(shader.vertexShader.match(/uniform float lookTime;/g)).toHaveLength(1)
  expect(shader.vertexShader).toContain('#include <project_vertex>\nvLookId = lookId;')
  const f = shader.fragmentShader
  expect(f.indexOf('Look lookRun(int id)')).toBeLessThan(f.indexOf('void main() {'))
  expect(f.indexOf('Look lookRun(int id)')).toBeGreaterThan(f.indexOf('#include <clipping_planes_pars_fragment>'))
  expect(f).toContain('Look kl = lookRun(int(vLookId + 0.5));')
  expect(f).toContain('float roughnessFactor = kl.rough;')
  expect(f).not.toContain('#include <roughnessmap_fragment>')
  expect(f).toContain('float metalnessFactor = kl.metal;')
  expect(f).toContain('normal = kl.ownNormal ? kl.normal : lookBent;')
  expect(f).toContain('totalEmissiveRadiance += kl.glow;')
  expect(f).toContain('reflectedLight.directDiffuse *= mix(1.0, kl.ao, kl.aoDirect);')
  for (const line of ['material.ior = kl.ior;', 'material.clearcoat = kl.clearcoat;', 'material.sheenColor = kl.sheen;', 'material.transmission = kl.transmission;', 'material.attenuationColor = kl.attColour;'])
    expect(f).toContain(line)
  expect(f).toContain('directLight.color *= lookShadow( int( vLookId + 0.5 ), directLight.direction );')
  for (const chunk of ['lights_physical_fragment', 'transmission_fragment', 'lights_fragment_begin']) expect(f).not.toContain(`#include <${chunk}>`)
})

test('the shared textures are the library\'s: the noise grey and tiling, the random table every byte', () => {
  const noise = noiseBytes()
  expect(noise).toHaveLength(256 * 256 * 4)
  for (let i = 0; i < 64; i++) expect([noise[i * 4], noise[i * 4 + 1], noise[i * 4 + 2], noise[i * 4 + 3]]).toEqual([noise[i * 4], noise[i * 4], noise[i * 4], 255])
  let lo = 255, hi = 0
  for (let i = 0; i < noise.length; i += 4) { lo = Math.min(lo, noise[i]); hi = Math.max(hi, noise[i]) }
  expect(hi).toBeGreaterThan(lo)
  const random = randomBytes()
  expect(random).toHaveLength(RAND * RAND * 4)
  expect(new Set(random).size).toBeGreaterThan(200)
  expect(free('flat varying float vLookId;\nvarying vec2 vS3;\nvarying vec3 vDressWorld;', 'flat varying float vLookId;\nvarying vec2 vS3;\n'))
    .toBe('float vLookId;\nvec2 vS3;\nvarying vec3 vDressWorld;')
})

test('a file baked with a stack binds the stack the loader hands over as the pictures, with the means the bake wrote, and asks for no picture one by one', async () => {
  const { page, frames } = await open('stacked')
  await frames(6)
  const s = page.client!.plugins.supershader3d
  const loader = page.client!.plugins.loader
  expect(s.uniforms.lookPictures.value).toBe(loader.get('rockStack'))
  expect(s.uniforms.lookPictures.value.wrapS).toBe(THREE.RepeatWrapping)
  expect(s.uniforms.lookMeans.value).toEqual(STACK.means)
  expect(loader.catalogued('rockColour')).toBeUndefined()
  expect(s.ready()).toBe(true)
  await expect((await open('misstacked')).frames(3)).rejects.toThrow('supershader3d: the looks\' pictures are the stack rockStack (main.pictures.ktx2), which is no .ktx2 texture entry of the loader\'s catalogue')
})

test('a file whose looks read the course table throws naming the word nothing delivers, and a picture that is no texture entry throws naming it', async () => {
  await expect((await open('coursed')).frames(3)).rejects.toThrow('supershader3d has no behavior for the shared texture courses, which the looks read: no plugin world.supershader3d.mods.behaviors names delivers it')
  await expect((await open('unpictured')).frames(3)).rejects.toThrow('supershader3d: the looks read the picture rockColour (Rock007_4K_Color.webp), which is no texture entry of the loader\'s catalogue')
})
