// supershader3d's mod for terrain3d, named by the scene's `world.terrain3d.mods.behaviors`. The test
// writes a game folder of its own, a manager and one child, `hills`, whose ground has a map layer, a
// layer in the look `stone` and a layer in the look `path`, a relief look, through a page on the
// loopback as `index.html` makes one, with render3d handed a canvas stand-in and no renderer. The
// ground's material is made once the field has landed, and its program, compiled as render3d would
// compile it, holds the one shader's preamble after everything three declares, with its varyings
// plain globals, each look layer's read calling its look and leaving its weight for the shadow, the
// map layer's read as before, the roughness and cavity each layer's, and the directional light
// shadowed by the relief layer; the plugin's uniforms are the material's. A layer wearing a look the
// file does not hold throws naming it, a layer of a word nothing delivers throws naming it, and the
// plugin listed after terrain3d throws on the first frame.
import { afterAll, expect, test, vi } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import * as THREE from 'three'
import { boot, type Scene } from '#engine/engine.ts'
import { accept, link, load, manager, modsOf, view } from '#addons/scenemanager/scenemanager.addon.ts'
import { loopback } from '#addons/loopback/loopback.addon.ts'
import { scenemanager } from '#plugins/scenemanager/scenemanager.sim.ts'
import { written } from '#plugins/loader/loader.sim.ts'
import type { Field } from '#plugins/terrain3d/terrain3d.sim.ts'
import { behaviors } from './supershader3d.terrain3d.ts'
import type { Looks } from './supershader3d.plugin.ts'

const DT = 1 / 60
;(globalThis as any).addEventListener = () => {}
;(globalThis as any).removeEventListener = () => {}
let clock = 0
vi.spyOn(performance, 'now').mockImplementation(() => clock)

// the varyings compose.js writes, on both sides
const VARYINGS = 'flat varying float vLookId;\nvarying vec3 vLookInfo;\nvarying vec2 vLookUv;\nvarying vec3 vLookWorld;\nvarying vec3 vLookWN;\nvarying vec3 vS0;\nvarying vec3 vS1;\nvarying vec4 vS2;\nvarying vec2 vS3;\n'
const BASE = `${VARYINGS}#define s0 vS0\n#define s1 vS1\n#define s2 vS2\n#define s3 vS3\nvec2 lookGx, lookGy;\n` +
  'struct Look { vec3 colour; float rough; float height; vec3 nts; vec3 normal; bool ownNormal; float ao; };\nLook lookStart() { Look k; k.colour = vec3(0.5); k.rough = 0.8; k.ao = 1.0; return k; }\n' +
  'vec3 kitBump(vec3 pos, vec3 n, float h, float fd) { return n; }\nvec3 lookPerturb(vec3 n, vec3 nts, float fd) { return n; }\n'
const shaderOf = (ids: number[], shadows: number[]) => ({
  ids,
  fragmentPars: `${BASE}${ids.map(id => `void look_${id}(inout Look k) {\n  k.colour = vec3(${id}.0);\n}\n`).join('')}${shadows.map(id => `float lookShadow_${id}(vec3 Lview) {\n  return 0.5;\n}\n`).join('')}` +
    `Look lookRun(int id) {\n  Look k = lookStart();\n  switch (id) {\n${ids.map(id => `    case ${id}: look_${id}(k); break;`).join('\n')}\n  }\n  return k;\n}\n` +
    `float lookShadow(int id, vec3 Lview) {\n  ${shadows.length ? `switch (id) {\n${shadows.map(id => `    case ${id}: return lookShadow_${id}(Lview);`).join('\n')}\n  }` : ''}\n  return 1.0;\n}\n`,
  features: {},
})
const LOOKS: Looks = {
  about: 'a test', picture: 64,
  materials: [{ name: 'stone', look: 'rock', call: 'solid', colour: [0.5, 0.5, 0.5] }, { name: 'path', look: 'cobble', call: 'relief', colour: [0.4, 0.4, 0.4] }],
  vertexPars: `attribute float lookId;\nattribute vec3 s0;\n${VARYINGS}`, vertexMain: 'vLookId = lookId;\nvS0 = s0;\n',
  calls: { solid: shaderOf([0], []), relief: shaderOf([1], [1]), seeThrough: null, all: shaderOf([0, 1], [1]) },
  settings: { width: 1, materials: [[], [{ name: 'size', type: 'float', value: 0.15 }]] }, needs: [], pictures: [],
}
const LOOKS_URL = '/supershader3d-terrain3d-test/main.looks.json'
written(LOOKS_URL, JSON.stringify(LOOKS))

const fieldOf = (layers: Field['ground']['layers']): Field => ({
  program: { world: 600, hscale: 30, sea: 0.5, flood: false, out: 'hills', nodes: [{ id: 'hills', op: 'noise', kind: 'simplex', freq: 12, seed: 3 }] },
  analysis: { slopeStep: 1.5, curveStep: 4, positionRadius: 18, occlusionRadius: 30, occlusionSteps: 5, cliffProbe: 12, cliffSlope: 0.5, cliffDrop: 7, flatAngle: 0.03, records: 50000 },
  ground: { layers, roughness: 0.7 },
  surfaces: {},
  layers: [],
})
const fields: Record<string, Field> = {
  hills: fieldOf([{ name: 'grass', look: 'stone' }, { name: 'gravel', map: 'gravel', scale: 20, where: [{ q: 'slope', lo: 0.2, hi: 0.4 }] }, { name: 'cobbles', look: 'path', where: [{ q: 'height', lo: 2, hi: 4 }] }]),
  unknown: fieldOf([{ name: 'grass', look: 'funkystone' }]),
  wordless: fieldOf([{ name: 'grass', tint: 'green' }]),
}
for (const [name, f] of Object.entries(fields)) written(`/supershader3d-terrain3d-test/${name}.json`, JSON.stringify(f))

const sceneOf = (field: string, plugins: string[]): Scene => ({
  world: {
    loader: { assets: { looks: { type: 'json', url: LOOKS_URL, preload: true }, land: { type: 'json', url: `/supershader3d-terrain3d-test/${field}.json`, preload: true }, gravel: { type: 'texture', url: '/supershader3d-terrain3d-test/gravel.png' } } },
    supershader3d: { looks: 'looks' },
    terrain3d: { field: 'land', rings: [{ reach: 40, seg: 10 }], shadowReach: 100, budget: 1e9, seabed: false, mods: { behaviors: ['supershader3d'] } },
  },
  prefabs: { engine: { dt: DT, width: 320, height: 200 }, scenemanager: { out: {} }, loader: {}, render3d: { camera: { fov: 60, near: 0.1, far: 1000, at: [0, 20, 0], look: [10, 0, 10] } } },
  actors: [{ is: 'scenemanager' }, { is: 'loader' }],
  plugins,
  seats: 1,
})
const scenes: Record<string, Scene> = {
  hills: sceneOf('hills', ['loader', 'scenemanager', 'supershader3d', 'terrain3d', 'render3d']),
  unknown: sceneOf('unknown', ['loader', 'scenemanager', 'supershader3d', 'terrain3d', 'render3d']),
  wordless: sceneOf('wordless', ['loader', 'scenemanager', 'supershader3d', 'terrain3d', 'render3d']),
  late: sceneOf('hills', ['loader', 'scenemanager', 'terrain3d', 'supershader3d', 'render3d']),
}
const dir = mkdtempSync(join(tmpdir(), 'supershader3d-terrain3d-'))
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
    world: {}, plugins: ['scenemanager'], seats: 1,
    prefabs: { engine: { dt: DT }, scenemanager: { scenes: { [entry]: { file: `${entry}.scene.json`, suspend: false } }, dt: DT, entry, port: 0 } },
    actors: [{ is: 'scenemanager' }],
  }
  const truth = boot(structuredClone(top), { scenemanager })
  const field = (await load(truth, home)).get(entry)!
  const surface = (s: Scene) => ({ addEventListener: () => {}, style: {} as any, width: s.prefabs.engine.width, height: s.prefabs.engine.height, remove() {} })
  const page = view(link(loopback(accept(manager(truth)))), top, home, (me, s) => { me.plugins.render3d.canvas = surface(s) })
  const frames = async (k: number) => { for (let i = 0; i < k; i++) { truth.step(DT); clock += DT * 1000; await page.frame() } }
  return { field, page, frames }
}

test('the scene\'s behaviors mod is supershader3d\'s, delivering look', async () => {
  const { field } = await open('hills')
  expect(modsOf(field.world, 'terrain3d', 'behaviors')).toEqual([behaviors])
})

test('the ground\'s program holds the one shader, each look layer read by its look, the map layer as before, and the sun shadowed by the relief layer', async () => {
  const { page, frames } = await open('hills')
  await frames(3)
  const { terrain3d, supershader3d: s } = page.client!.plugins
  for (let i = 0; i < 60 && !terrain3d.rings.length; i++) await frames(1)
  const material = terrain3d.rings[0].mesh.material as THREE.MeshStandardMaterial
  expect(material.userData.terrain3d.lookSettings).toBe(s.uniforms.lookSettings)
  expect(material.userData.terrain3d.lookView).toBe(s.uniforms.lookView)
  // the program as render3d compiles it
  const shader = { vertexShader: THREE.ShaderLib.standard.vertexShader, fragmentShader: THREE.ShaderLib.standard.fragmentShader, uniforms: {} as Record<string, unknown> }
  material.onBeforeCompile(shader as any, undefined as any)
  const f = shader.fragmentShader
  expect(f).not.toMatch(/varying \S+ v(Look|S[0-3])/)
  expect(f).toContain('float vLookId;')
  expect(f).toContain('vec2 vS3;')
  expect(f.indexOf('Look lookRun(int id)')).toBeGreaterThan(f.indexOf('#include <clipping_planes_pars_fragment>'))
  expect(f.indexOf('Look lookRun(int id)')).toBeLessThan(f.indexOf('void main() {'))
  // layer 0 reads stone, layer 2 reads path and leaves its weight; layer 1 reads its map
  expect(f).toContain('void tdRead0(vec3 p, vec3 n, vec3 dpx, vec3 dpy, vec3 wv, float wt, out vec3 alb, out vec3 nrm, out float rough, out float ao) {\n  vec3 q = p + wv;')
  expect(f).toContain('vLookInfo = vec3(0.0, 0.0, 0.0); vLookId = 0.0;\n  Look kk = lookRun(0);')
  expect(f).toContain('vLookInfo = vec3(1.0, 2.0, 0.0); vLookId = 1.0;\n  Look kk = lookRun(1);')
  expect(f).toContain('tdLw2 = wt;')
  expect(f).not.toContain('tdLw0 = wt;')
  expect(f).toContain('void tdRead1(vec3 p, vec3 n, vec3 dpx, vec3 dpy, vec3 wv, float wt, out vec3 alb, out vec3 nrm, out float rough, out float ao) {\n  float S = tdSlot[1];')
  expect(f).toContain('rough = 0.700000; ao = 1.0;')
  expect(f).toContain('tdRead2(tdP, tdGeo, tdDx, tdDy, tdWv2, tdW2, tdAlb2, tdNrm2, tdRo2, tdAo2);')
  expect(f).toContain('tdRough = tdRo0 * tdW0 + tdRo1 * tdW1 + tdRo2 * tdW2;')
  expect(f).toContain('roughnessFactor = tdRough;')
  expect(f).toContain('reflectedLight.indirectDiffuse *= tdAO;')
  // the relief layer's shadow in the directional light
  expect(f).toContain('float tdLookShadow(vec3 L) {\n  float s = 1.0;\n  s *= mix(1.0, lookShadow(1, L), tdLw2);\n  return s;\n}')
  expect(f).toContain('getDirectionalLightInfo( directionalLight, directLight );\n\t\tdirectLight.color *= tdLookShadow( directLight.direction );')
  expect(f).not.toContain('#include <lights_fragment_begin>')
  expect(material.customProgramCacheKey()).toContain('tdLookShadow')
  expect(shader.uniforms.lookSettings).toBe(s.uniforms.lookSettings)
  expect(shader.uniforms.tdVals).toBeDefined()
})

test('a layer wearing a look the file does not hold, a layer of a word nothing delivers, and the plugin listed after terrain3d each throw, naming it', async () => {
  const until = async (entry: string) => {
    const { page, frames } = await open(entry)
    await frames(1)
    for (let i = 0; i < 60 && !page.client!.plugins.terrain3d.rings.length; i++) await frames(1)
  }
  await expect(until('unknown')).rejects.toThrow('terrain3d ground layer 0 (grass) wears the look funkystone, which the looks file does not hold')
  await expect(until('wordless')).rejects.toThrow('terrain3d has no behavior for layer grass, of the word tint: no plugin world.terrain3d.mods.behaviors names delivers it')
  await expect(until('late')).rejects.toThrow('terrain3d is listed before supershader3d, whose behaviors it reads that frame')
})
