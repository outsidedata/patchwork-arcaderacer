// hair3d's browser half on three in node, on a scene the test writes, its hairs file an entry of its
// catalogue, booted through `load` as a game's would so its mods are loaded: puppet3d's bodies as its
// skins, render3d's `skinned` as their word. No GPU is here: the renderer is a stand-in that takes the
// targets the pass is drawn into, and what the page holds is read off `bodies` and the meshes it put on
// the scene.
import { afterAll, expect, test } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import * as THREE from 'three'
import { boot, type Row, type Scene, type W } from '#engine/engine.ts'
import type { Plugins } from '#engine/browser.ts'
import { load } from '#addons/scenemanager/scenemanager.addon.ts'
import { scenemanager } from '#plugins/scenemanager/scenemanager.sim.ts'
import { json, written } from '#plugins/loader/loader.sim.ts'
import { gpgpu3d } from '#plugins/gpgpu3d/gpgpu3d.plugin.ts'
import { hair3d } from './hair3d.plugin.ts'
import { TIE_TEXELS, type Hair, type Hair3d } from './hair3d.sim.ts'

const DT = 1 / 60
const coat: Hair = {
  on: { meshes: 'hide', bones: ['tip'], weight: 0.5, cuts: [], planes: [], faces: [] },
  density: 400, strands: 3, length: [0.1, 0], width: [0.004, 0], taper: 0.5, thin: 0, links: 2, segments: 2,
  comb: [0, 0, 0], stiffness: [10, 1], gravity: 9.8, damping: 2, drag: 1,
  clump: { radius: 0.01, tight: 0.5 }, curl: { radius: 0, turns: 0 }, ragged: 0,
  colours: { root: '#000000', tip: '#ffffff' }, vary: 0, ao: 0, roughness: 0.5, shine: { strength: 0, power: 1 }, translucency: 0,
  shadow: true,
}
const file: Hair3d = { wind: { toward: 0, speed: 0 }, gust: { scale: 1, strength: 0, rate: 0 }, kinds: { beast: { hairs: ['coat'] } }, hairs: { coat } }
written('/hair3d-plugin-test/hairs.json', JSON.stringify(file))
// The same hair with a program of ops: its length by a noise over the skin, its curl swung by the clock, and
// its root tinted by the noise.
const programmed: Hair3d = {
  ...file,
  hairs: {
    coat: {
      ...coat,
      program: {
        nodes: [
          { id: 'n', op: 'noise', kind: 'value', freq: 3 },
          { id: 'clock', op: 'time', rate: 1 },
          { id: 'wave', op: 'fold', input: 'clock', kind: 'wave' },
        ],
        out: { length: 'n', curlRadius: 'wave', rootColour: { to: '#c8b040', by: 'n' } },
      },
    },
  },
}

const top: Scene = {
  prefabs: { engine: { dt: DT }, scenemanager: { scenes: { yard: { file: 'yard.scene.json', suspend: false }, bare: { file: 'bare.scene.json', suspend: false } }, dt: DT, entry: 'yard', port: 0 } },
  actors: [{ is: 'scenemanager' }], plugins: ['scenemanager'], seats: 1,
}
const yard = {
  world: {
    loader: { assets: { hairs: { type: 'json', url: '/hair3d-plugin-test/hairs.json', preload: true } } },
    puppet3d: { kinds: ['beast'] },
    gpgpu3d: { reach: 10 },
    hair3d: { hairs: 'hairs', mods: { skins: ['puppet3d'], behaviors: ['render3d'], keeper: 'gpgpu3d' } },
  },
  prefabs: { engine: { dt: DT, width: 320, height: 200 }, scenemanager: { out: {} }, loader: {}, probe: {} },
  actors: [{ is: 'scenemanager' }, { is: 'loader' }, { is: 'probe' }],
  plugins: ['scenemanager', 'loader', 'puppet3d', 'gpgpu3d', 'hair3d', 'render3d'],
}
const dir = mkdtempSync(join(tmpdir(), 'hair3d-plugin-'))
const path = (p: string) => JSON.stringify(new URL(p, import.meta.url).pathname)
writeFileSync(join(dir, 'yard.scene.json'), JSON.stringify(yard))
writeFileSync(join(dir, 'yard.sim.ts'), `
import { scenemanager } from ${path('../scenemanager/scenemanager.sim.ts')}
import { loader } from ${path('../loader/loader.sim.ts')}
import file from './yard.scene.json' with { type: 'json' }
export const sim = { scenemanager, loader, probe: { after(_me, _dt, w) { globalThis.hair3dPlugin = w } } }
export const scene = file
`)
// The same scene with no behaviors named.
writeFileSync(join(dir, 'bare.scene.json'), JSON.stringify({ ...yard, world: { ...yard.world, hair3d: { hairs: 'hairs', mods: { skins: ['puppet3d'], keeper: 'gpgpu3d' } } } }))
writeFileSync(join(dir, 'bare.sim.ts'), `
import { scenemanager } from ${path('../scenemanager/scenemanager.sim.ts')}
import { loader } from ${path('../loader/loader.sim.ts')}
import file from './bare.scene.json' with { type: 'json' }
export const sim = { scenemanager, loader, probe: { after(_me, _dt, w) { globalThis.hair3dPlugin = w } } }
export const scene = file
`)
afterAll(() => rmSync(dir, { recursive: true }))

// A square metre of skin, its left edge held by the bone `root` and its right by `tip`.
function hide() {
  const g = new THREE.PlaneGeometry(1, 1, 1, 1)
  g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute([0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0], 4))
  g.setAttribute('skinWeight', new THREE.Float32BufferAttribute([1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0], 4))
  const root = new THREE.Bone(), tip = new THREE.Bone()
  root.name = 'root'
  tip.name = 'tip'
  tip.position.x = 0.5
  root.add(tip)
  const mesh = new THREE.SkinnedMesh(g, new THREE.MeshStandardMaterial())
  mesh.name = 'hide'
  mesh.add(root)
  mesh.bind(new THREE.Skeleton([root, tip]))
  return mesh
}

test('a body of a kind that wears a hair grows it: its locks rooted, moved when the scene is drawn, and gone with its row', async () => {
  const child = (await load(boot(structuredClone(top), { scenemanager }), pathToFileURL(dir + '/').href)).get('yard')!
  child.step(DT)
  const w = (globalThis as { hair3dPlugin?: W }).hair3dPlugin!
  const scene = new THREE.Scene(), mesh = hide()
  const rows = [{ id: 1, kind: 'beast', data: {} }, { id: 2, kind: 'rock', data: {} }] as Row[]
  const bodies: Record<number, THREE.SkinnedMesh[]> = { 1: [mesh] }
  const plugins = {
    render3d: { THREE, scene, dress: (m: THREE.Material) => m },
    loader: { get: (name: string) => json(w, name) },
    puppet3d: { bodies: (id: number) => bodies[id] ?? [] },
    wire: { scene: { world: w.world, plugins: yard.plugins }, rows },
  } as unknown as Plugins
  plugins.gpgpu3d = gpgpu3d()
  plugins.hair3d = hair3d()
  plugins.hair3d.afterTick(plugins)

  const [body] = plugins.hair3d.bodies()
  expect(plugins.hair3d.bodies()).toHaveLength(1)
  expect(body).toMatchObject({ id: 'puppet3d 1', kind: 'beast' })
  expect(body.patches).toHaveLength(1)
  expect(body.patches[0]).toMatchObject({ hair: 'coat', skin: 'hide' })
  const locks = body.patches[0].locks
  expect(locks).toBe(plugins.hair3d.roots('puppet3d 1', 'coat').count)
  expect(locks).toBeGreaterThan(150)
  const drawn = scene.children.find(o => o.name === 'hair3d coat hide') as THREE.Mesh<THREE.InstancedBufferGeometry>
  expect(drawn.castShadow).toBe(true)

  // The scene drawn: the pass is drawn into the patch's state, and every strand of its one copy drawn.
  const into: unknown[] = []
  const renderer = { getRenderTarget: () => null, setRenderTarget: (t: unknown) => { into.push(t) }, render: () => {}, autoClear: true, xr: { enabled: false }, shadowMap: { autoUpdate: true }, capabilities: { maxTextureSize: 4096 } }
  const draw = () => (scene.onBeforeRender as (...a: unknown[]) => void)(renderer, scene, new THREE.PerspectiveCamera(), null)
  draw()
  expect(into).toContain(plugins.hair3d.state('puppet3d 1', 'coat'))
  expect(into[into.length - 1]).toBe(null)
  expect(drawn.geometry.instanceCount).toBe(locks * coat.strands)
  expect(plugins.hair3d.bodies()[0].patches[0]).toMatchObject({ copies: 1, room: 1 })

  // What a lock and a strand are is worked out once: drawn again and again, nothing more is kept; a number
  // of the hair changed, its locks are kept again and its strands, which are their own rolls, are not.
  const kept = () => plugins.hair3d.bodies()[0].patches[0].kept
  expect(kept()).toEqual({ locks: 1, strands: 1 })
  for (let n = 0; n < 3; n++) { plugins.hair3d.afterTick(plugins); draw() }
  expect(kept()).toEqual({ locks: 1, strands: 1 })
  const curlier = structuredClone(file)
  curlier.hairs.coat.curl = { radius: 0.01, turns: 2 }
  plugins.loader.get = () => curlier
  plugins.hair3d.afterTick(plugins)
  draw()
  expect(kept()).toEqual({ locks: 2, strands: 1 })

  // Its body gone, its hair goes off the scene.
  delete bodies[1]
  plugins.hair3d.afterTick(plugins)
  expect(plugins.hair3d.bodies()).toHaveLength(0)
  expect(scene.children.includes(drawn)).toBe(false)
  plugins.hair3d.close()
})

test('a hair with a program has it compiled with what is kept of a lock: what stands still is read back by the strands and never run by them, and what reads the clock runs each frame', async () => {
  const child = (await load(boot(structuredClone(top), { scenemanager }), pathToFileURL(dir + '/').href)).get('yard')!
  child.step(DT)
  const w = (globalThis as { hair3dPlugin?: W }).hair3dPlugin!
  const dressed: { surface: { uniforms: Record<string, { value: unknown }>; vertex: { common: string } } }[] = []
  const plugins = {
    render3d: { THREE, scene: new THREE.Scene(), dress: (m: THREE.Material, own: (typeof dressed)[number]) => { dressed.push(own); return m } },
    loader: { get: () => programmed },
    puppet3d: { bodies: () => [hide()] },
    wire: { scene: { world: w.world, plugins: yard.plugins }, rows: [{ id: 1, kind: 'beast', data: {} }] as Row[] },
  } as unknown as Plugins
  plugins.gpgpu3d = gpgpu3d()
  plugins.hair3d = hair3d()
  plugins.hair3d.afterTick(plugins)
  expect(dressed).toHaveLength(1)
  const glsl = dressed[0].surface.vertex.common
  // the noise is in the length and the root's colour, both kept: the strands' shader holds no noise
  expect(glsl).not.toContain('gpFbm')
  // the curl is swung by the clock, the one gpgpu3d sets: worked out as the strand is drawn
  expect(glsl).toContain('float hOutCurlRadius() { return max( gphairOut_curlRadius(), 0.0 ); }')
  expect(dressed[0].surface.uniforms.gpTime).toBeDefined()
  // a name the hair's program may not give is told as the hair's own
  const wrong = structuredClone(programmed)
  wrong.hairs.coat.program!.out = { nope: 'n' }
  plugins.loader.get = () => wrong
  expect(() => plugins.hair3d.afterTick(plugins)).toThrow('hair3d hair coat program out nope is none of cover, length, width, taper, combX, combY, combZ, stiffnessRoot, stiffnessTip, gravity, damping, drag, clumpRadius, clumpTight, curlRadius, curlTurns, ragged, vary, ao, roughness, shineStrength, shinePower, translucency, rootColour, tipColour')
  plugins.hair3d.close()
})

test('a hair with ties roots which lock is gathered where; a tie\'s own numbers are read as it draws, and where it is and who it gathers builds the hair again', async () => {
  const child = (await load(boot(structuredClone(top), { scenemanager }), pathToFileURL(dir + '/').href)).get('yard')!
  child.step(DT)
  const w = (globalThis as { hair3dPlugin?: W }).hair3dPlugin!
  // a tie on the right edge's bone `tip`, 0.2 in from it, round the middle of the square
  const tied = structuredClone(file)
  tied.hairs.coat.links = 4
  tied.hairs.coat.ties = [{
    bone: 'tip', at: [-0.2, 0.05, 0], around: [-0.5, 0, 0], lift: 0.01, hang: [0, -1, 0], fall: 0.5, reach: 0.3, share: 1,
    spread: 0.02, flare: 0.05, band: 0.1, side: [1, 0, 0], stiffness: [30, 3], braid: { radius: 0.01, pitch: 0.1 },
  }]
  const dressed: { surface: { uniforms: Record<string, { value: unknown }> } }[] = []
  let now = tied
  const mesh = hide()
  const plugins = {
    render3d: { THREE, scene: new THREE.Scene(), dress: (m: THREE.Material, own: (typeof dressed)[number]) => { dressed.push(own); return m } },
    loader: { get: () => now },
    puppet3d: { bodies: () => [mesh] },
    wire: { scene: { world: w.world, plugins: yard.plugins }, rows: [{ id: 1, kind: 'beast', data: {} }] as Row[] },
  } as unknown as Plugins
  plugins.gpgpu3d = gpgpu3d()
  plugins.hair3d = hair3d()
  plugins.hair3d.afterTick(plugins)
  const roots = plugins.hair3d.roots('puppet3d 1', 'coat')!
  const gathered = Array.from({ length: roots.count }, (_, i) => roots.tie[i * 4]).filter(n => n === 1).length
  expect(gathered).toBeGreaterThan(0)
  expect(gathered).toBeLessThan(roots.count)
  const ties = dressed[0].surface.uniforms.hTies.value as THREE.DataTexture
  const data = ties.image.data as Float32Array
  expect(data).toHaveLength(TIE_TEXELS * 4)
  expect(data[3]).toBe(1)
  expect(data[16]).toBeCloseTo(0.02, 6)

  // its spread changed: the texture is written again in place, the locks kept again and not rooted again
  const kept = () => plugins.hair3d.bodies()[0].patches[0].kept
  const was = kept().locks
  now = structuredClone(tied)
  now.hairs.coat.ties![0].spread = 0.04
  plugins.hair3d.afterTick(plugins)
  expect(plugins.hair3d.roots('puppet3d 1', 'coat')).toBe(roots)
  expect(dressed).toHaveLength(1)
  expect(dressed[0].surface.uniforms.hTies.value).toBe(ties)
  expect(data[16]).toBeCloseTo(0.04, 6)
  expect(ties.version).toBeGreaterThan(1)
  expect(kept().locks).toBe(was)

  // its reach changed: which locks it gathers is rooted again
  now = structuredClone(tied)
  now.hairs.coat.ties![0].reach = 0.05
  plugins.hair3d.afterTick(plugins)
  const again = plugins.hair3d.roots('puppet3d 1', 'coat')!
  expect(again).not.toBe(roots)
  expect(Array.from({ length: again.count }, (_, i) => again.tie[i * 4]).filter(n => n === 1).length).toBeLessThan(gathered)
  expect(dressed).toHaveLength(2)

  // a tie on a bone the skin has not is refused, naming it
  now = structuredClone(tied)
  now.hairs.coat.ties![0].bone = 'spine'
  expect(() => plugins.hair3d.afterTick(plugins)).toThrow('names the bone spine')
  plugins.hair3d.close()
})

test('a skin of a word no behaviors mod delivers is refused, naming the wearer and the word', async () => {
  const child = (await load(boot(structuredClone(top), { scenemanager }), pathToFileURL(dir + '/').href)).get('bare')!
  child.step(DT)
  const w = (globalThis as { hair3dPlugin?: W }).hair3dPlugin!
  const plugins = {
    render3d: { THREE, scene: new THREE.Scene(), dress: (m: THREE.Material) => m },
    loader: { get: (name: string) => json(w, name) },
    puppet3d: { bodies: () => [hide()] },
    wire: { scene: { world: w.world, plugins: yard.plugins }, rows: [{ id: 1, kind: 'beast', data: {} }] as Row[] },
  } as unknown as Plugins
  plugins.hair3d = hair3d()
  expect(() => plugins.hair3d.afterTick(plugins)).toThrow('hair3d has no behavior for a skin of puppet3d 1, of the word skinned: no plugin world.hair3d.mods.behaviors names delivers it')
})
