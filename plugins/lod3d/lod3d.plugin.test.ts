// lod3d's browser half on three in node, on a scene the test writes, booted through `load` as a game's would so
// its mods are loaded: terrain3d's land, its tiles worked in the land's workers or on the page, and drawn by
// instances3d. The page's land is the truth's, read through terrain3d's functions. Where the page has workers
// they are a stand-in `Worker` running what lod3d's own worker runs (`lod3d.tiles.ts`'s `serve`), loading the
// modules the page names and making its own land from what it is sent, each answer a turn after it is asked.
import { afterAll, afterEach, expect, test } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import * as THREE from 'three'
import { boot, type Scene, type W } from '#engine/engine.ts'
import type { Plugins } from '#engine/browser.ts'
import { load } from '#addons/scenemanager/scenemanager.addon.ts'
import { scenemanager } from '#plugins/scenemanager/scenemanager.sim.ts'
import { written } from '#plugins/loader/loader.sim.ts'
import { edits, heightAt, paintAt, ramp, type Field, type Rule } from '#plugins/terrain3d/terrain3d.sim.ts'
import { instances3d } from '#plugins/instances3d/instances3d.plugin.ts'
import { lod3d } from './lod3d.plugin.ts'
import type { Lod3d, Thing } from './lod3d.sim.ts'
import { holder, serve, type Answer, type Asked } from './lod3d.tiles.ts'

const DT = 1 / 60
const field: Field = {
  program: { world: 600, hscale: 3, sea: -1, flood: false, out: 'hills', nodes: [{ id: 'hills', op: 'noise', kind: 'simplex', freq: 12, seed: 3 }] },
  analysis: { slopeStep: 1.5, curveStep: 4, positionRadius: 18, occlusionRadius: 30, occlusionSteps: 5, cliffProbe: 12, cliffSlope: 0.5, cliffDrop: 7, flatAngle: 0.03, records: 50000 },
  ground: { layers: [{ name: 'grass', map: 'grass', scale: 30 }] },
  surfaces: {},
  layers: [],
}
written('/lod3d-plugin-test/hills.json', JSON.stringify(field))

const stone = { shape: { detail: 1, lumpy: [0.7, 0.3], squash: 0.7 }, colour: '#777777', shadow: 0, leaf: 0 }
const settings: Lod3d = {
  mods: { surfaces: ['terrain3d'], seen: ['terrain3d'], behaviors: ['terrain3d', 'instances3d'] },
  rings: [40, 100], budget: 1000,
  layers: {
    grove: { use: ['tree', 'ferns'], on: ['land'] },
    tree: { on: ['land'], rows: { t: {} }, cell: 10, seed: 1, spacing: 10, density: 1, size: [1, 0], mesh: { ...stone, lods: [0, 0] } },
    ferns: { on: ['tree'], rows: { f: {} }, cell: 10, seed: 2, count: 6, ring: [1, 2], density: 1, size: [1, 0], mesh: { ...stone, lods: [0] } },
  },
}
const top: Scene = {
  prefabs: { engine: { dt: DT }, scenemanager: { scenes: { yard: { file: 'yard.scene.json', suspend: false } }, dt: DT, entry: 'yard', port: 0 } },
  actors: [{ is: 'scenemanager' }], plugins: ['scenemanager'], seats: 1,
}
const yard = {
  world: {
    loader: { assets: { land: { type: 'json', url: '/lod3d-plugin-test/hills.json', preload: true } } },
    terrain3d: { field: 'land' },
    instances3d: { cutout: 0.4, coverage: 0.3 },
    lod3d: settings,
  },
  prefabs: { engine: { dt: DT, width: 320, height: 200 }, scenemanager: { out: {} }, loader: {}, probe: {} },
  actors: [{ is: 'scenemanager' }, { is: 'loader' }, { is: 'probe' }],
  plugins: ['scenemanager', 'loader', 'terrain3d', 'instances3d', 'lod3d', 'render3d'],
}
const dir = mkdtempSync(join(tmpdir(), 'lod3d-plugin-'))
const path = (p: string) => JSON.stringify(new URL(p, import.meta.url).pathname)
writeFileSync(join(dir, 'yard.scene.json'), JSON.stringify(yard))
writeFileSync(join(dir, 'yard.sim.ts'), `
import { scenemanager } from ${path('../scenemanager/scenemanager.sim.ts')}
import { loader } from ${path('../loader/loader.sim.ts')}
import file from './yard.scene.json' with { type: 'json' }
export const sim = { scenemanager, loader, probe: { after(_me, _dt, w) { globalThis.lod3dPlugin = w } } }
export const scene = file
`)
afterAll(() => rmSync(dir, { recursive: true }))

const booted = async () => {
  const child = (await load(boot(structuredClone(top), { scenemanager }), pathToFileURL(dir + '/').href)).get('yard')!
  child.step(DT)
  return (globalThis as { lod3dPlugin?: W }).lod3dPlugin!
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
    serve(this.h, structuredClone(a), answer => setTimeout(() => this.heard.forEach(f => f({ data: structuredClone(answer) })), 0))
  }
  addEventListener(type: string, f: (e: { data: Answer }) => void) { if (type === 'message') this.heard.push(f) }
  terminate() {}
}
afterEach(() => {
  delete (globalThis as { Worker?: unknown }).Worker
  sent = []
  made = 0
})
const asked = () => sent.filter((a): a is Extract<Asked, { type: 'tiles' }> => a.type === 'tiles')

// A page on the truth `w`: its land the truth's, `moved` making its version move; workers where `workers`.
// `onPage` counts the heights the page's land is asked for.
async function page(w: W, workers: boolean) {
  // The page has `Worker` or not on each of its frames, so two pages run side by side in one test.
  const frame = () => {
    if (workers) (globalThis as { Worker?: unknown }).Worker = Standin
    else delete (globalThis as { Worker?: unknown }).Worker
    plugins.lod3d.afterTick(plugins)
  }
  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera()
  let moved = 0, onPage = 0
  let place: number[] | undefined
  const ground = {
    prepared: () => place,
    height: (x: number, z: number) => { onPage++; return heightAt(w, x, z) },
    cover: (x: number, z: number) => paintAt(w, x, z).cover,
    ramp: (r: Rule, x: number, z: number) => ramp(w, r, x, z),
    rules: (list: Rule[], what: string) => edits(w).land.rules(list, what),
    edits: () => ({ land: edits(w).land, layers: [{ version: moved }] }),
    shown: () => true,
  }
  const plugins = {
    render3d: { THREE, scene, camera, dress: (m: THREE.Material) => m },
    loader: { ready: () => true, load: async () => {}, model: () => undefined },
    terrain3d: { ground },
    wire: { scene: { world: w.world, plugins: yard.plugins } },
  } as unknown as Plugins
  plugins.instances3d = instances3d()
  plugins.lod3d = lod3d()
  const turn = () => new Promise(done => setTimeout(done, 0))
  // Frames, a turn between each, until nothing is asked of the workers, nothing is in flight and nothing
  // is waiting to be held.
  const settle = async () => {
    for (let n = 0; n < 400; n++) {
      frame()
      await turn()
      const lives = Object.values(plugins.lod3d.layers()) as { away?: { flight: number; back: unknown[]; again: unknown[] }; queue: unknown[]; next: number }[]
      if (n > 2 && lives.every(x => !x.away || (x.away.flight === 0 && !x.away.back.length && !x.away.again.length)) && lives.every(x => x.next >= x.queue.length)) return
    }
    throw new Error('lod3d never settled')
  }
  return { plugins, camera, frame, settle, move: () => { moved++ }, onPage: () => onPage, prepare: (at: number[] | undefined) => { place = at } }
}

// Each layer's held tiles, by tile, its things and its shell.
const heldOf = (plugins: Plugins) =>
  Object.fromEntries(Object.entries(plugins.lod3d.layers() as Record<string, { held: Map<number, { i: number; j: number; things: Thing[]; shell: number }> }>).map(([name, l]) =>
    [name, Object.fromEntries([...l.held.values()].map(h => [`${h.i} ${h.j}`, { things: h.things, shell: h.shell }]))]))

test('with workers every tile is worked off the page, on a land the workers make from the field, and held as the page would hold it', async () => {
  const w = await booted()
  const on = await page(w, false), off = await page(w, true)
  for (const p of [on, off]) p.camera.position.set(100, 0, 100)
  await on.settle()
  await off.settle()
  const held = heldOf(on.plugins)
  expect(Object.keys(held['grove/tree']).length).toBe(21 * 21)
  expect(Object.values(held['grove/ferns']).flatMap(h => h.things).length).toBeGreaterThan(100)
  expect(heldOf(off.plugins)).toEqual(held)
  // The page's land was never asked for a height: every tile was worked in a worker, BATCH at most a task.
  expect(on.onPage()).toBeGreaterThan(0)
  expect(off.onPage()).toBe(0)
  expect(made).toBeGreaterThan(0)
  // Every worker was handed the layers, the land and terrain3d's module with its field before any tile.
  const holds = sent.filter(a => a.type === 'hold')
  expect(holds.length).toBe(made)
  expect(sent.slice(0, made).every(a => a.type === 'hold')).toBe(true)
  const hold = holds[0] as Extract<Asked, { type: 'hold' }>
  expect(Object.keys(hold.held.plugins)).toEqual(['terrain3d'])
  expect((hold.held.plugins.terrain3d.held as { field: Field }).field).toEqual(field)
  expect(asked().length).toBeGreaterThan(1)
  expect(Math.max(...asked().map(a => a.tiles.length))).toBe(64)
})

test('a camera moved on holds the new tiles from the workers, in the shells they are in, and lets go of those out of reach', async () => {
  const w = await booted()
  const on = await page(w, false), off = await page(w, true)
  for (const p of [on, off]) p.camera.position.set(100, 0, 100)
  await on.settle()
  await off.settle()
  for (const p of [on, off]) p.camera.position.set(260, 0, 180)
  await on.settle()
  await off.settle()
  expect(heldOf(off.plugins)).toEqual(heldOf(on.plugins))
  expect(off.onPage()).toBe(0)
})

test('a height shrinks every shell onto the ground under the camera, the finer first, and -1 puts them back as they were', async () => {
  const w = await booted()
  const on = await page(w, false), off = await page(w, true)
  for (const p of [on, off]) p.camera.position.set(100, 0, 100)
  await on.settle()
  const flat = heldOf(on.plugins)
  // rings [40, 100], cell 10: at 80 m up shell 0 is gone, and shell 1 reaches ⌈√(100² − 80²) / 10⌉ = 6 tiles.
  for (const p of [on, off]) p.plugins.lod3d.height(80)
  await on.settle()
  await off.settle()
  const high = heldOf(on.plugins)['grove/tree']
  expect(Object.keys(high).length).toBe(13 * 13)
  expect(Object.values(high).every(h => h.shell === 1)).toBe(true)
  expect(Object.keys(high).every(k => k.split(' ').every(n => Math.abs(+n - 10) <= 6))).toBe(true)
  expect(heldOf(off.plugins)).toEqual(heldOf(on.plugins))
  // At 100 m up and over, nothing is in reach.
  on.plugins.lod3d.height(100)
  await on.settle()
  expect(Object.keys(heldOf(on.plugins)['grove/tree']).length).toBe(0)
  // 0 is the same as -1, and -1 puts every tile back in the shell it was in.
  on.plugins.lod3d.height(0)
  await on.settle()
  expect(heldOf(on.plugins)).toEqual(flat)
  on.plugins.lod3d.height(80)
  await on.settle()
  on.plugins.lod3d.height(-1)
  await on.settle()
  expect(heldOf(on.plugins)).toEqual(flat)
  expect(() => on.plugins.lod3d.height(-2)).toThrow('lod3d\'s height -2 is not -1')
  expect(() => on.plugins.lod3d.height(NaN)).toThrow('lod3d\'s height NaN is not -1')
})

test('a version that moves lets go of the answers in flight and asks again for every held tile, which keeps its instances meanwhile', async () => {
  const w = await booted()
  const off = await page(w, true)
  off.camera.position.set(100, 0, 100)
  await off.settle()
  const before = heldOf(off.plugins)
  const first = asked().length, holds = sent.filter(a => a.type === 'hold').length
  off.move()
  off.frame()
  // The workers handed the new version, the held tiles asked again, and still drawn as they were until the
  // answers come.
  expect(sent.filter(a => a.type === 'hold').length).toBe(holds + made)
  expect(asked().slice(first).flatMap(a => a.tiles).length).toBeGreaterThan(0)
  expect(heldOf(off.plugins)).toEqual(before)
  // A second move before those come back: their answers are let go, and the tiles asked a third time.
  const second = asked().length
  off.move()
  await off.settle()
  const tiles = (from: number, name: string) => asked().slice(from).filter(a => a.name === name).flatMap(a => a.tiles.map(t => t.join(' '))).sort()
  expect(tiles(second, 'grove/tree')).toEqual(Object.keys(before['grove/tree']).sort())
  expect(heldOf(off.plugins)).toEqual(before)
  expect(off.onPage()).toBe(0)
})

test('the layers are made again when world.lod3d differs, written in place deep inside or not, and kept while it stays the same, a fresh copy of it included', async () => {
  const w = await booted()
  const on = await page(w, false)
  on.camera.position.set(100, 0, 100)
  await on.settle()
  const first = on.plugins.lod3d.layers()
  on.frame()
  expect(on.plugins.lod3d.layers() === first).toBe(true)
  // One number deep in a layer, written in place as a dev page's panel writes a scene.
  const was = w.world.lod3d as Lod3d
  const ring = (was.layers.ferns as { ring: number[] }).ring
  ring[1] = 3
  on.frame()
  const again = on.plugins.lod3d.layers()
  expect(again === first).toBe(false)
  on.frame()
  expect(on.plugins.lod3d.layers() === again).toBe(true)
  w.world.lod3d = structuredClone(was)
  on.frame()
  expect(on.plugins.lod3d.layers() === again).toBe(true)
  // The truth's world is the scene file's, which every test loads; it is put back as it was.
  ring[1] = 2
  w.world.lod3d = was
})

test('a prepared place is worked ahead off the scene, ready once every tile in reach of it is, and held whole the frame the camera arrives, asking the land nothing more', async () => {
  const w = await booted()
  const truth = await page(w, false)
  truth.camera.position.set(400, 0, 100)
  await truth.settle()
  for (const workers of [false, true]) {
    const p = await page(w, workers)
    p.camera.position.set(100, 0, 100)
    await p.settle()
    // No place in hand: ready.
    expect(p.plugins.lod3d.ready()).toBe(true)
    const before = heldOf(p.plugins)
    p.prepare([400, 100])
    p.frame()
    if (workers) expect(p.plugins.lod3d.ready()).toBe(false)
    for (let n = 0; n < 50 && !p.plugins.lod3d.ready(); n++) { p.frame(); await new Promise(done => setTimeout(done, 0)) }
    expect(p.plugins.lod3d.ready()).toBe(true)
    // Worked off the scene: the field round the camera is as it was.
    expect(heldOf(p.plugins)).toEqual(before)
    const asked = p.onPage()
    p.camera.position.set(400, 0, 100)
    p.frame()
    // Held whole in the frame the camera arrives, the same as a page that settled there, and the land asked
    // for nothing in that frame: every tile came from what was worked ahead.
    expect(heldOf(p.plugins)).toEqual(heldOf(truth.plugins))
    expect(p.onPage()).toBe(asked)
    expect(p.plugins.lod3d.ready()).toBe(true)
  }
})

test('a camera that jumps onto a place nothing has worked yet holds every tile in reach in that frame, on the page, workers or not', async () => {
  const w = await booted()
  const truth = await page(w, false)
  truth.camera.position.set(400, 0, 100)
  await truth.settle()
  const p = await page(w, true)
  p.camera.position.set(100, 0, 100)
  await p.settle()
  p.prepare([400, 100])
  p.camera.position.set(400, 0, 100)
  p.frame()
  expect(heldOf(p.plugins)).toEqual(heldOf(truth.plugins))
  // Answers still in flight come back to tiles already held, and change none of them.
  await p.settle()
  expect(heldOf(p.plugins)).toEqual(heldOf(truth.plugins))
  expect(p.plugins.lod3d.ready()).toBe(true)
})

test('where the page has no Worker, every tile is worked on the page', async () => {
  const w = await booted()
  const on = await page(w, false)
  on.camera.position.set(100, 0, 100)
  await on.settle()
  expect([made, sent]).toEqual([0, []])
  expect(Object.keys(heldOf(on.plugins)['grove/tree']).length).toBe(21 * 21)
})
