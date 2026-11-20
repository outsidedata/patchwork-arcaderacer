// world3d's mod for supershader3d, on a page of the test's own through the loopback, as `index.html` makes one, with
// render3d handed a canvas stand-in and no renderer. The scene names its place, `yard`, and gives supershader3d no
// looks of its own: the `looks` mod names the place's looks file, whose looks read the course table, which the
// `behaviors` mod delivers as world3d's. The place, one triangle of the one solid material, is drawn in
// supershader3d's own material.
import { afterAll, expect, test, vi } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import * as THREE from 'three'
import { boot, type Scene } from '#engine/engine.ts'
import { accept, link, load, manager, mod, modsOf, view } from '#addons/scenemanager/scenemanager.addon.ts'
import { loopback } from '#addons/loopback/loopback.addon.ts'
import { scenemanager } from '#plugins/scenemanager/scenemanager.sim.ts'
import { written } from '#plugins/loader/loader.sim.ts'
import type { Looks } from '#plugins/supershader3d/supershader3d.plugin.ts'
import { behaviors, looks } from './world3d.supershader3d.ts'

const DT = 1 / 60
;(globalThis as any).addEventListener = () => {}
;(globalThis as any).removeEventListener = () => {}
let clock = 0
vi.spyOn(performance, 'now').mockImplementation(() => clock)

// The place's glb: one triangle of the material 0, its look's number an attribute of its own, as pro-ng's pack writes.
function glb(): Uint8Array {
  const position = new Float32Array([0, 0, 0, 1, 0, 0, 0, 0, 1])
  const look = new Float32Array([0, 0, 0])
  const index = new Uint16Array([0, 1, 2, 0])
  const bin = new Uint8Array(position.byteLength + look.byteLength + index.byteLength)
  bin.set(new Uint8Array(position.buffer), 0)
  bin.set(new Uint8Array(look.buffer), position.byteLength)
  bin.set(new Uint8Array(index.buffer), position.byteLength + look.byteLength)
  const gltf = {
    asset: { version: '2.0' },
    nodes: [
      { name: 'pro-ng', extras: { courses: [{ thing: 'hut', look: 'rock', feet: [0, 0.5], wallDepth: 0.4 }], vertex: { meshes: ['ground'], attributes: { position: [['POSITION', 0], ['POSITION', 1], ['POSITION', 2]], lookId: [['_LOOK', 0]] }, defaults: {} } } },
      { name: 'ground', mesh: 0 },
    ],
    meshes: [{ primitives: [{ attributes: { POSITION: 0, _LOOK: 1 }, indices: 2 }] }],
    accessors: [
      { bufferView: 0, componentType: 5126, count: 3, type: 'VEC3' },
      { bufferView: 1, componentType: 5126, count: 3, type: 'SCALAR' },
      { bufferView: 2, componentType: 5123, count: 3, type: 'SCALAR' },
    ],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: position.byteLength },
      { buffer: 0, byteOffset: position.byteLength, byteLength: look.byteLength },
      { buffer: 0, byteOffset: position.byteLength + look.byteLength, byteLength: 6 },
    ],
    buffers: [{ byteLength: bin.length }],
  }
  let text = JSON.stringify(gltf)
  text += ' '.repeat((4 - (text.length % 4)) % 4)
  const json = new TextEncoder().encode(text)
  const out = new Uint8Array(28 + json.length + bin.length)
  const v = new DataView(out.buffer)
  v.setUint32(0, 0x46546c67, true)
  v.setUint32(4, 2, true)
  v.setUint32(8, out.length, true)
  v.setUint32(12, json.length, true)
  v.setUint32(16, 0x4e4f534a, true)
  out.set(json, 20)
  v.setUint32(20 + json.length, bin.length, true)
  v.setUint32(24 + json.length, 0x004e4942, true)
  out.set(bin, 28 + json.length)
  return out
}

// A looks file of one solid material, whose look reads the course table.
const shader = { ids: [0], fragmentPars: 'uniform highp sampler2D lookSettings;\nuniform sampler2D csCourses;\nflat varying float vLookId;\nvarying vec3 vLookInfo;\nvarying vec2 vLookUv;\nvarying vec3 vLookWorld;\nvarying vec3 vLookWN;\nstruct Look { vec3 colour; float rough; float metal; float alpha; };\nLook lookRun(int id) { Look k; k.colour = vec3(0.5); return k; }\nfloat lookShadow(int id, vec3 Lview) { return 1.0; }\n', features: { clearcoat: false, sheen: false, iridescence: false, dispersion: false, transmission: false } }
const LOOKS: Looks = {
  about: 'a test',
  picture: 64,
  materials: [{ name: 'stone', look: 'rock', call: 'solid', colour: [0.5, 0.5, 0.5] }],
  vertexPars: 'attribute float lookId;\nflat varying float vLookId;\n',
  vertexMain: 'vLookId = lookId;\n',
  calls: { solid: shader, relief: null, seeThrough: null, all: shader },
  settings: { width: 1, materials: [[]] },
  needs: ['courses'],
  pictures: [],
}
const at = '/world3d-supershader3d-test/'
written(`${at}yard.looks.json`, JSON.stringify(LOOKS))
written(`${at}yard.glb`, glb())
written(`${at}yard.clips.json`, JSON.stringify({ things: [] }))
written(`${at}yard.effects.json`, JSON.stringify({ spawns: [] }))

const sceneOf = (supershader3d: Record<string, unknown>): Scene => ({
  world: {
    loader: {
      assets: {
        'yard.looks': { type: 'json', url: `${at}yard.looks.json`, preload: true },
        'yard.glb': { type: 'binary', url: `${at}yard.glb`, preload: true },
        'yard.clips': { type: 'json', url: `${at}yard.clips.json`, preload: true },
        'yard.effects': { type: 'json', url: `${at}yard.effects.json`, preload: true },
      },
    },
    world3d: { place: 'yard' },
    supershader3d,
  },
  prefabs: { engine: { dt: DT, width: 320, height: 200 }, scenemanager: { out: {} }, loader: {} },
  actors: [{ is: 'scenemanager' }, { is: 'loader' }],
  plugins: ['loader', 'scenemanager', 'supershader3d', 'world3d', 'render3d'],
  seats: 1,
})
const scenes: Record<string, Scene> = {
  yard: sceneOf({ mods: { looks: 'world3d', behaviors: ['world3d'] } }),
}
const dir = mkdtempSync(join(tmpdir(), 'world3d-supershader3d-'))
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
  const room = (await load(truth, home)).get(entry)!
  const surface = (s: Scene) => ({ addEventListener: () => {}, style: {} as any, width: s.prefabs.engine.width, height: s.prefabs.engine.height, remove() {} })
  const page = view(link(loopback(accept(manager(truth)))), top, home, (me, s) => { me.plugins.render3d.canvas = surface(s) })
  const frames = async (k: number) => {
    for (let i = 0; i < k; i++) {
      truth.step(DT)
      clock += DT * 1000
      await page.frame()
      await new Promise(r => setTimeout(r, 0))
    }
  }
  return { page, frames, room }
}

test('the scene\'s looks mod and behaviors are world3d\'s', async () => {
  const { room } = await open('yard')
  expect(mod(room.world, 'supershader3d', 'looks')).toBe(looks)
  expect(modsOf(room.world, 'supershader3d', 'behaviors')).toEqual([behaviors])
  expect(looks(room.world)).toBe('yard.looks')
})

test('supershader3d draws the place\'s looks file, binds world3d\'s course table, and world3d draws the place in its material', async () => {
  const { page, frames } = await open('yard')
  await frames(4)
  const { supershader3d: s, world3d: w, render3d } = page.client!.plugins
  expect(s.looks()).toEqual(LOOKS)
  expect(s.uniforms.csCourses.value).toBe(w.courses(THREE))
  const data = w.courses(THREE).image.data as Float32Array
  expect([...data.subarray(0, 3)]).toEqual([0, 0.5, 1e4 + 2])
  const placed = render3d.scene.children.filter((o: THREE.Object3D) => (o as THREE.Mesh).isMesh && !(o as THREE.SkinnedMesh).isSkinnedMesh) as THREE.Mesh[]
  const drawn = placed.filter(m => Array.isArray(m.material) && m.material.includes(s.material('solid')))
  expect(drawn).toHaveLength(1)
  expect(drawn[0].geometry.getAttribute('position').count).toBe(3)
  page.close()
  expect(render3d.scene.children).not.toContain(drawn[0])
})
