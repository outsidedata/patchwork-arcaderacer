// grass3d's browser half on three in node, on a scene the test writes, its grasses file an entry of its
// catalogue, booted through `load` as a game's would
// so its mods are loaded: terrain3d's land, and gpgpu3d's things, walker's bodies as cylinders, pressing it
// as walker's `cylinder` says. The page's land is the truth's,
// read through terrain3d's functions. Where the page has workers they are a stand-in `Worker` running what
// grass3d's own worker runs (`grass3d.blocks.ts`'s `serve`), each answer a turn after it is asked. No GPU is
// here: what the page holds is read off `at`, `blocks` and `chunks`, and off the meshes it put on the scene.
import { afterAll, afterEach, expect, test } from 'vitest'
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
import { edits, heightAt, paintAt, ramp, type Field, type Rule } from '#plugins/terrain3d/terrain3d.sim.ts'
import { gpgpu3d } from '#plugins/gpgpu3d/gpgpu3d.plugin.ts'
import { grass3d } from './grass3d.plugin.ts'
import { BLOCK, levelsOf, windowOf, type Grass, type Grass3d } from './grass3d.sim.ts'
import { holder, serve, type Answer, type Asked } from './grass3d.blocks.ts'

const DT = 1 / 60
const field: Field = {
  program: { world: 600, hscale: 6, sea: -1, flood: false, out: 'hills', nodes: [{ id: 'hills', op: 'noise', kind: 'simplex', freq: 12, seed: 3 }] },
  analysis: { slopeStep: 1, curveStep: 4, positionRadius: 18, occlusionRadius: 30, occlusionSteps: 5, cliffProbe: 12, cliffSlope: 0.5, cliffDrop: 7, flatAngle: 0.03, records: 50000 },
  ground: { layers: [{ name: 'grass', map: 'grass', scale: 30 }] },
  surfaces: {},
  layers: [],
}
written('/grass3d-plugin-test/hills.json', JSON.stringify(field))
const own = { land: 'terrain3d', keeper: 'gpgpu3d', pressed: 'gpgpu3d', behaviors: ['walker'] }

const grass: Grass = {
  rules: [{ q: 'slope', lo: 0.5, hi: 0.3 }], density: 100, full: 4, reach: 24, fade: 6, tile: 2,
  height: [0.4, 0.5], width: [0.04, 0.5], widen: 0.5, widest: 6, lean: 0.2, segments: [4, 2, 1], chunks: 3,
  colours: { root: '#203010', tip: '#90b050', dry: '#b0a060' }, dry: { amount: 0.3, scale: 10 },
  vary: 0.1, translucency: 0.5, roughness: 0.7, ao: 0.4, shadow: 6,
}
const settings: Grass3d = {
  budget: 1000, wind: { toward: 90, speed: 3 }, gust: { scale: 12, strength: 0.5, flutter: 0.05, rate: 2 },
  bend: 0.07, trample: { recover: 20, reach: 0.3 }, grasses: { meadow: grass },
}
written('/grass3d-plugin-test/grasses.json', JSON.stringify(settings))
// The same grass with a program of ops: a patch of tall grass by noise, each blade's own roll, its distance to
// the camera, and the clock, to the outputs height, cover and bright, and the rest of what a blade has: its vary,
// ao, translucency, roughness, bend and dry amount, a root colour tinted by the noise and a tip colour of three
// nodes. Its width, dry patches and dry colour it leaves to the grass.
const programmed: Grass3d = {
  ...settings,
  grasses: {
    meadow: {
      ...grass,
      program: {
        nodes: [
          { id: 'n', op: 'noise', kind: 'value', freq: 0.1 },
          { id: 'r', op: 'roll', salt: 2 },
          { id: 'tall', op: 'combine', a: 'n', b: 'r', mode: 'mul' },
          { id: 'd', op: 'dist' },
          { id: 'near', op: 'ramp', input: 'd', lo: 20, hi: 5 },
          { id: 'clock', op: 'time', rate: 1 },
          { id: 'wave', op: 'fold', input: 'clock', kind: 'wave' },
        ],
        out: {
          height: 'tall', cover: 'near', bright: 'wave', vary: 'n', ao: 'near', translucency: 'wave', roughness: 'n', bend: 'near', dryAmount: 'n',
          rootColour: { to: '#c8b040', by: 'n' }, tipColour: { r: 'n', g: 'near', b: 'wave' },
        },
      },
    },
  },
}
written('/grass3d-plugin-test/programmed.json', JSON.stringify(programmed))
const top: Scene = {
  prefabs: { engine: { dt: DT }, scenemanager: { scenes: { yard: { file: 'yard.scene.json', suspend: false }, programmed: { file: 'programmed.scene.json', suspend: false } }, dt: DT, entry: 'yard', port: 0 } },
  actors: [{ is: 'scenemanager' }], plugins: ['scenemanager'], seats: 1,
}
const yard = {
  world: {
    loader: { assets: { land: { type: 'json', url: '/grass3d-plugin-test/hills.json', preload: true }, grasses: { type: 'json', url: '/grass3d-plugin-test/grasses.json', preload: true } } },
    terrain3d: { field: 'land', rings: [{ reach: 16, seg: 64 }] },
    walker: { kinds: { body: { radius: 0.6, height: 1.8 } } },
    gpgpu3d: { reach: 30, mods: { things: ['walker'], behaviors: ['shapes3d'] } },
    grass3d: { grasses: 'grasses', mods: own },
  },
  prefabs: { engine: { dt: DT, width: 320, height: 200 }, scenemanager: { out: {} }, loader: {}, probe: {} },
  actors: [{ is: 'scenemanager' }, { is: 'loader' }, { is: 'probe' }],
  plugins: ['scenemanager', 'loader', 'terrain3d', 'walker', 'gpgpu3d', 'grass3d', 'render3d'],
}
// The scene with the programmed grasses file, and grass3d's op delivered to gpgpu3d.
const programmedYard = {
  ...yard,
  world: {
    ...yard.world,
    loader: { assets: { ...yard.world.loader.assets, grasses: { type: 'json', url: '/grass3d-plugin-test/programmed.json', preload: true } } },
    gpgpu3d: { ...yard.world.gpgpu3d, mods: { ...yard.world.gpgpu3d.mods, ops: ['grass3d'] } },
  },
}
const dir = mkdtempSync(join(tmpdir(), 'grass3d-plugin-'))
const path = (p: string) => JSON.stringify(new URL(p, import.meta.url).pathname)
for (const [name, scene] of [['yard', yard], ['programmed', programmedYard]] as const) {
  writeFileSync(join(dir, `${name}.scene.json`), JSON.stringify(scene))
  writeFileSync(join(dir, `${name}.sim.ts`), `
import { scenemanager } from ${path('../scenemanager/scenemanager.sim.ts')}
import { loader } from ${path('../loader/loader.sim.ts')}
import file from './${name}.scene.json' with { type: 'json' }
export const sim = { scenemanager, loader, probe: { after(_me, _dt, w) { globalThis.grass3dPlugin = w } } }
export const scene = file
`)
}
afterAll(() => rmSync(dir, { recursive: true }))

const booted = async (scene = 'yard') => {
  const child = (await load(boot(structuredClone(top), { scenemanager }), pathToFileURL(dir + '/').href)).get(scene)!
  child.step(DT)
  return (globalThis as { grass3dPlugin?: W }).grass3dPlugin!
}

// Every message the stand-in workers were sent, and how many were made.
let sent: Asked[] = []
let made = 0
class Standin {
  private h = holder()
  private heard: ((e: { data: Answer }) => void)[] = []
  constructor() { made++ }
  postMessage(a: Asked) {
    sent.push(structuredClone(a))
    void serve(this.h, structuredClone(a), answer => setTimeout(() => this.heard.forEach(f => f({ data: answer })), 0))
  }
  addEventListener(type: string, f: (e: { data: Answer }) => void) { if (type === 'message') this.heard.push(f) }
  terminate() {}
}
afterEach(() => {
  delete (globalThis as { Worker?: unknown }).Worker
  sent = []
  made = 0
})

// A page on the truth `w`: its land the truth's, workers where `workers`; `rows` the rows its wire holds.
// `onPage` counts the heights the page's land is asked for.
async function page(w: W, workers: boolean) {
  const frame = () => {
    if (workers) (globalThis as { Worker?: unknown }).Worker = Standin
    else delete (globalThis as { Worker?: unknown }).Worker
    plugins.gpgpu3d.afterTick(plugins)
    plugins.grass3d.afterTick(plugins)
  }
  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera()
  let onPage = 0
  let place: number[] | undefined
  const ground = {
    prepared: () => place,
    height: (x: number, z: number) => { onPage++; return heightAt(w, x, z) },
    cover: (x: number, z: number) => paintAt(w, x, z).cover,
    ramp: (r: Rule, x: number, z: number) => ramp(w, r, x, z),
    rules: (list: Rule[], what: string) => edits(w).land.rules(list, what),
    edits: () => ({ land: edits(w).land, layers: [] }),
    shown: () => true,
  }
  const rows: Row[] = []
  // what each material was dressed with: the surface splice of its shaders
  const dressed: { surface: { uniforms: Record<string, { value: unknown }>; vertex: { common: string } } }[] = []
  // a stand-in renderer: every draw of the keeping shader is counted
  let draws = 0
  const renderer = { getRenderTarget: () => null, setRenderTarget: () => {}, render: () => { draws++ }, autoClear: true, xr: { enabled: false }, shadowMap: { autoUpdate: true }, capabilities: { maxTextureSize: 4096 } }
  const plugins = {
    render3d: { THREE, scene, camera, renderer, dress: (m: THREE.Material, own: (typeof dressed)[number]) => { dressed.push(own); return m } },
    terrain3d: { ground },
    loader: { get: (name: string) => json(w, name) },
    wire: { scene: { world: w.world, plugins: yard.plugins, prefabs: yard.prefabs }, rows, n: 1 },
  } as unknown as Plugins
  plugins.gpgpu3d = gpgpu3d()
  plugins.grass3d = grass3d()
  const turn = () => new Promise(done => setTimeout(done, 0))
  // Frames, a turn between each, until every block of the window is held and nothing is in flight.
  const settle = async () => {
    for (let n = 0; n < 400; n++) {
      frame()
      await turn()
      const b = plugins.grass3d.blocks()
      if (b.of > 0 && b.held === b.of && b.flight === 0) { frame(); return }
    }
    throw new Error('grass3d never settled')
  }
  return { plugins, scene, camera, rows, frame, settle, dressed, draws: () => draws, onPage: () => onPage, prepare: (at: number[] | undefined) => { place = at } }
}

const CELL = 0.5
const { blocks } = windowOf(CELL, grass.reach + grass.tile)

test('the window round the camera holds the land at every lattice point, the same filled in workers as on the page', async () => {
  const w = await booted()
  const on = await page(w, false), off = await page(w, true)
  for (const p of [on, off]) p.camera.position.set(40, 3, -25)
  await on.settle()
  await off.settle()
  expect(on.plugins.grass3d.blocks().of).toBe(blocks * blocks)
  // Every lattice point of the window, read off the page that filled it itself and the one whose workers did.
  const cx = Math.floor(40 / CELL / BLOCK), cz = Math.floor(-25 / CELL / BLOCK), half = (blocks - 1) / 2
  let n = 0
  for (let j = (cz - half) * BLOCK; j < (cz + half + 1) * BLOCK; j += 7) {
    for (let i = (cx - half) * BLOCK; i < (cx + half + 1) * BLOCK; i += 7) {
      const a = on.plugins.grass3d.at(i, j)
      expect(a.height).toBe(Math.fround(heightAt(w, i * CELL, j * CELL)))
      expect(off.plugins.grass3d.at(i, j)).toEqual(a)
      n++
    }
  }
  expect(n).toBeGreaterThan(100)
  expect(off.onPage()).toBe(0)
  expect(made).toBeGreaterThan(0)
  expect(sent.filter(a => a.type === 'hold').length).toBe(made)
})

test('each level draws only its chunks that reach its band, round the camera, and those within the shadow reach cast', async () => {
  const w = await booted()
  const p = await page(w, false)
  p.camera.position.set(10, 3, 10)
  await p.settle()
  const [g] = p.plugins.grass3d.chunks()
  const levels = levelsOf(grass)
  expect(g.levels.map((l: { level: { k: number } }) => l.level.k)).toEqual(levels.map(l => l.k))
  for (const l of g.levels) {
    const L = l.level
    expect(l.chunks).toHaveLength(L.chunks * L.chunks)
    for (const c of l.chunks) {
      expect(c.count).toBe(L.chunk * L.chunk * L.blades)
      const x0 = c.at[0] * grass.tile, z0 = c.at[1] * grass.tile, x1 = x0 + L.chunk * grass.tile, z1 = z0 + L.chunk * grass.tile
      const nearest = Math.hypot(Math.max(x0 - 10, 0, 10 - x1), Math.max(z0 - 10, 0, 10 - z1))
      const farthest = Math.hypot(Math.max(Math.abs(x0 - 10), Math.abs(x1 - 10)), Math.max(Math.abs(z0 - 10), Math.abs(z1 - 10)))
      expect(c.visible).toBe(nearest < L.to && farthest >= L.from)
      expect(c.castShadow).toBe(nearest < grass.shadow)
    }
  }
  // Level 0's middle chunk holds the camera's tile.
  const middle = g.levels[0].chunks[Math.floor(grass.chunks * grass.chunks / 2)]
  expect(middle.at[0] * grass.tile).toBeLessThanOrEqual(10)
  expect((middle.at[0] + levels[0].chunk) * grass.tile).toBeGreaterThan(10)
  // Every chunk is on the scene, a mesh of an instanced blade.
  const meshes = p.scene.children.filter(o => o.name.startsWith('grass3d meadow'))
  expect(meshes).toHaveLength(levels.reduce((n, l) => n + l.chunks * l.chunks, 0))
})

test('a camera moved on wipes the blocks it left and holds the land of those it came to', async () => {
  const w = await booted()
  const p = await page(w, false)
  p.camera.position.set(0, 3, 0)
  await p.settle()
  p.camera.position.set(200, 3, 120)
  p.frame()
  // The old window's middle is out of the new one, and nothing of it is held.
  expect(p.plugins.grass3d.at(0, 0)).toBeUndefined()
  await p.settle()
  const i = Math.round(200 / CELL), j = Math.round(120 / CELL)
  expect(p.plugins.grass3d.at(i, j).height).toBe(Math.fround(heightAt(w, i * CELL, j * CELL)))
})

test('a body standing on the ground tramples the lattice under it, lying away from its middle; one in the air does not', async () => {
  const w = await booted()
  const p = await page(w, false)
  p.camera.position.set(0, 3, 0)
  await p.settle()
  const y = heightAt(w, 2, 1)
  p.rows.push({ id: 1, kind: 'body', data: { pos: [2, y, 1] } } as Row)
  p.rows.push({ id: 2, kind: 'body', data: { pos: [-3, heightAt(w, -3, 1) + 2, 1] } } as Row)
  p.frame()
  const east = p.plugins.grass3d.at(Math.round(2.4 / CELL), Math.round(1 / CELL))
  expect(east.trampled).toBeGreaterThan(0)
  expect(east.lies[0]).toBeCloseTo(1, 5)
  expect(east.lies[1]).toBeCloseTo(0, 5)
  const north = p.plugins.grass3d.at(Math.round(2 / CELL), Math.round(0.5 / CELL))
  expect(north.lies[1]).toBeCloseTo(-1, 5)
  // Outside its radius, and under the body in the air, nothing lies.
  expect(p.plugins.grass3d.at(Math.round(3 / CELL), Math.round(1 / CELL)).trampled).toBe(0)
  expect(p.plugins.grass3d.at(Math.round(-3 / CELL), Math.round(1 / CELL)).trampled).toBe(0)
})

test('a prepared place is filled ahead, off the window, and the frame the camera arrives its window is whole', async () => {
  const w = await booted()
  const p = await page(w, true)
  p.camera.position.set(0, 3, 0)
  await p.settle()
  p.prepare([300, 300])
  p.frame()
  expect(p.plugins.grass3d.ready()).toBe(false)
  for (let n = 0; n < 400 && !p.plugins.grass3d.ready(); n++) { p.frame(); await new Promise(done => setTimeout(done, 0)) }
  expect(p.plugins.grass3d.ready()).toBe(true)
  // Nothing of the place is in the window yet.
  expect(p.plugins.grass3d.at(600, 600)).toBeUndefined()
  p.camera.position.set(300, 3, 300)
  p.frame()
  const b = p.plugins.grass3d.blocks()
  expect(b.held).toBe(b.of)
  expect(p.plugins.grass3d.at(600, 600).height).toBe(Math.fround(heightAt(w, 300, 300)))
  expect(p.plugins.grass3d.ready()).toBe(true)
})

test('a grass with a program has it compiled by gpgpu3d over the ops the scene delivers, into every material of the grass, and a grass with none draws as it always did', async () => {
  const w = await booted('programmed')
  const p = await page(w, false)
  p.camera.position.set(0, 3, 0)
  await p.settle()
  const levels = levelsOf(programmed.grasses.meadow)
  expect(p.dressed).toHaveLength(levels.length)
  for (const d of p.dressed) {
    const glsl = d.surface.vertex.common
    // what never changes is kept: the blade's shader reads the noise and the blade's own roll back, and runs neither
    expect(glsl).not.toContain('gpFbm')
    expect(glsl).not.toContain('gpRollOf( 2 )')
    // what moves is worked out each frame: the cover by the camera's distance, the brightness by the clock
    expect(glsl).toContain('float gOutCover() { return max( gpgrass0Out_cover(), 0.0 ); }')
    expect(glsl).toContain('float gOutBright() { return max( gpgrass0Out_bright(), 0.0 ); }')
    expect(glsl).toContain('gpTime')
    // the clock is the one gpgpu3d sets, the same object in every level
    expect(d.surface.uniforms.gpTime).toBe(p.dressed[0].surface.uniforms.gpTime)
  }
  const clock = p.dressed[0].surface.uniforms.gpTime
  p.plugins.wire.n = 121
  p.frame()
  expect(clock.value).toBeCloseTo(121 / 60)
  // the same scene's grass with no program: every output its default, no clock read
  const plain = await page(await booted(), false)
  plain.camera.position.set(0, 3, 0)
  await plain.settle()
  for (const d of plain.dressed) {
    expect(d.surface.vertex.common).not.toContain('gpTime')
    expect(d.surface.uniforms.gpTime).toBeUndefined()
  }
})

test('a blade is worked out once: a camera standing still keeps nothing more, and one moved a tile keeps only the tiles that came into view', async () => {
  const w = await booted()
  const p = await page(w, false)
  p.camera.position.set(10, 3, 10)
  await p.settle()
  const drew = () => p.plugins.grass3d.kept()[0].levels.map((l: { drew: number }) => l.drew)
  const settled = drew(), draws = p.draws()
  for (const n of settled) expect(n).toBeGreaterThan(0)
  for (let n = 0; n < 5; n++) p.frame()
  expect(drew()).toEqual(settled)
  expect(p.draws()).toBe(draws)
  // a tile on, in the same block of ground: each level keeps a strip of its square, never the whole of it
  p.camera.position.set(10 + grass.tile, 3, 10)
  p.frame()
  const moved = drew(), levels = levelsOf(grass)
  moved.forEach((n: number, k: number) => {
    expect(n).toBeGreaterThan(settled[k])
    expect(n - settled[k]).toBeLessThan(levels[k].side * levels[k].side / 2)
  })
  p.frame()
  expect(drew()).toEqual(moved)
})

test('a scene that names no keeper is told so, and a program that is wrong is told as the grass\'s own', async () => {
  const unnamed = await booted('programmed')
  delete (unnamed.world.grass3d as { mods: Record<string, unknown> }).mods.keeper
  const a = await page(unnamed, false)
  a.camera.position.set(0, 3, 0)
  expect(() => a.frame()).toThrow('grass3d keeps what each blade is once it is worked out, and the scene names no world.grass3d.mods.keeper')
  const b = await page(await booted('programmed'), false)
  b.camera.position.set(0, 3, 0)
  const wrong = structuredClone(programmed)
  wrong.grasses.meadow.program!.out = { nope: 'tall' }
  b.plugins.loader.get = () => wrong
  expect(() => b.frame()).toThrow('grass3d grass meadow program out nope is none of height, width, lean, cover, bright, vary, ao, translucency, roughness, bend, dryAmount, dry, rootColour, tipColour, dryColour')
  // a colour given as a node, and a number given as a colour, are told which they should be
  const colour = structuredClone(programmed)
  colour.grasses.meadow.program!.out = { rootColour: 'tall' }
  b.plugins.loader.get = () => colour
  expect(() => b.frame()).toThrow('grass3d grass meadow program out rootColour is a node id, and rootColour is a colour: { r, g, b } of node ids, or { to: "#rrggbb", by: <node id> }')
  const number = structuredClone(programmed)
  number.grasses.meadow.program!.out = { height: { to: '#c8b040', by: 'tall' } }
  b.plugins.loader.get = () => number
  expect(() => b.frame()).toThrow('grass3d grass meadow program out height is a colour, and height is a number: a node id')
  const c = await page(await booted('programmed'), false)
  c.camera.position.set(0, 3, 0)
  const sheet = structuredClone(programmed)
  sheet.grasses.meadow.program!.nodes[1] = { id: 'r', op: 'roll', salt: -1 }
  c.plugins.loader.get = () => sheet
  expect(() => c.frame()).toThrow('grass3d grass meadow program node 1 (r) of roll salt -1 is not a whole number at or above 0')
})
