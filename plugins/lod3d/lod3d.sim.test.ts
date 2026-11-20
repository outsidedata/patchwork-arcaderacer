// lod3d's layers on a scene the test writes, booted through `load` as a game's would: terrain3d's land and
// a shapes3d box handed by their mods. Its `probe` hands the test the child's `w`.
import { afterAll, expect, test } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { boot, type Scene, type W } from '#engine/engine.ts'
import { load } from '#addons/scenemanager/scenemanager.addon.ts'
import { scenemanager } from '#plugins/scenemanager/scenemanager.sim.ts'
import { written } from '#plugins/loader/loader.sim.ts'
import { heightAt, type Field } from '#plugins/terrain3d/terrain3d.sim.ts'
import { check, geometry, layersOf, tile, type Layer, type Lod3d, type Thing } from './lod3d.sim.ts'
import { holder } from './lod3d.tiles.ts'
import { solids } from './lod3d.walker.ts'

const DT = 1 / 60
const field: Field = {
  program: { world: 600, hscale: 3, sea: -1, flood: false, out: 'hills', nodes: [{ id: 'hills', op: 'noise', kind: 'simplex', freq: 12, seed: 3 }] },
  analysis: { slopeStep: 1.5, curveStep: 4, positionRadius: 18, occlusionRadius: 30, occlusionSteps: 5, cliffProbe: 12, cliffSlope: 0.5, cliffDrop: 7, flatAngle: 0.03, records: 50000 },
  ground: { layers: [{ name: 'grass', map: 'grass', scale: 30 }] },
  surfaces: {},
  layers: [],
}
written('/lod3d-sim-test/hills.json', JSON.stringify(field))

const base = { cell: 10, density: 1, size: [1, 0] as [number, number], mesh: { asset: 'm', lods: [0], shadow: 0, leaf: 0 } }
const lod3d: Lod3d = {
  mods: { surfaces: ['terrain3d', 'shapes3d'], seen: ['terrain3d', 'shapes3d'], behaviors: ['terrain3d', 'shapes3d', 'instances3d'] },
  rings: [100], budget: 2,
  layers: {
    grove: { use: ['tree', 'ferns'], on: ['land'] },
    tree: { ...base, on: ['land'], rows: { t: { solid: 0.5, tall: 4 } }, seed: 1, spacing: 10 },
    ferns: { ...base, on: ['tree'], rows: { f: {} }, seed: 2, count: 6, ring: [1, 2] },
    tops: { ...base, on: ['crate'], rows: { g: {} }, seed: 3, spacing: 1, rules: [{ q: 'up', lo: 0.7, hi: 0.9 }] },
  },
}
const top: Scene = {
  prefabs: { engine: { dt: DT }, scenemanager: { scenes: { yard: { file: 'yard.scene.json', suspend: false } }, dt: DT, entry: 'yard', port: 0 } },
  actors: [{ is: 'scenemanager' }], plugins: ['scenemanager'], seats: 1,
}
const yard = {
  world: {
    loader: { assets: { land: { type: 'json', url: '/lod3d-sim-test/hills.json', preload: true } } },
    terrain3d: { field: 'land' },
    shapes3d: { kinds: { crate: { shape: { box: { size: [4, 2, 6] } } } } },
    lod3d: { ...lod3d, widest: 2, remember: 1000 },
  },
  prefabs: { engine: { dt: DT, width: 320, height: 200 }, scenemanager: { out: {} }, loader: {}, probe: {}, crate: { pos: [0, 0, 0], yaw: 0 } },
  actors: [{ is: 'scenemanager' }, { is: 'loader' }, { is: 'probe' }, { is: 'crate', pos: [5, 20, 5], yaw: 0.5 }],
  plugins: ['scenemanager'],
}
const dir = mkdtempSync(join(tmpdir(), 'lod3d-sim-'))
const path = (p: string) => JSON.stringify(new URL(p, import.meta.url).pathname)
writeFileSync(join(dir, 'yard.scene.json'), JSON.stringify(yard))
writeFileSync(join(dir, 'yard.sim.ts'), `
import { scenemanager } from ${path('../scenemanager/scenemanager.sim.ts')}
import { loader } from ${path('../loader/loader.sim.ts')}
import file from './yard.scene.json' with { type: 'json' }
export const sim = { scenemanager, loader, crate: {}, probe: { after(_me, _dt, w) { globalThis.lod3dSim = w } } }
export const scene = file
`)
afterAll(() => rmSync(dir, { recursive: true }))

const booted = async () => {
  const child = (await load(boot(structuredClone(top), { scenemanager }), pathToFileURL(dir + '/').href)).get('yard')!
  child.step(DT)
  return (globalThis as { lod3dSim?: W }).lod3dSim!
}
const around = (w: W, name: string, x: number, z: number, n: number): Thing[] => {
  const s = w.world.lod3d as Lod3d, layers = layersOf(s), { surfaces, behaviors } = geometry(w), l = layers[name]
  const out: Thing[] = []
  for (let j = Math.floor(z / l.cell) - n; j <= Math.floor(z / l.cell) + n; j++) for (let i = Math.floor(x / l.cell) - n; i <= Math.floor(x / l.cell) + n; i++) out.push(...tile(name, layers, i, j, surfaces, behaviors, { w }))
  return out
}

test('a use places its layers under its name, and a layer on another stands round each of its instances on the same land', async () => {
  const w = await booted()
  const s = w.world.lod3d as Lod3d
  check(s, geometry(w).surfaces, geometry(w).behaviors, { w })
  expect(Object.keys(layersOf(s)).sort()).toEqual(['grove/ferns', 'grove/tree', 'tops'])
  const trees = around(w, 'grove/tree', 100, 100, 4), ferns = around(w, 'grove/ferns', 100, 100, 3)
  expect(trees.length).toBeGreaterThan(20)
  expect(ferns.length).toBeGreaterThan(20)
  for (const f of ferns) {
    expect(f.at[1]).toBeCloseTo(heightAt(w, f.at[0], f.at[2]), 9)
    // Its own tree is one of them, its ring [1, 2] metres out across x and z.
    expect(trees.some(t => { const d = Math.hypot(t.at[0] - f.at[0], t.at[2] - f.at[2]); return d >= 1 - 1e-9 && d <= 2 + 1e-9 })).toBe(true)
  }
  // The same tile is the same instances every time.
  expect(around(w, 'grove/ferns', 100, 100, 3)).toEqual(ferns)
})

test('a worker of lod3d\'s works a batch of tiles, on the land, round another layer and on a box, to the same instances as the truth', async () => {
  const w = await booted()
  const s = w.world.lod3d as Lod3d, layers = layersOf(s), { surfaces, behaviors } = geometry(w)
  // What the page hands a worker: the layers, every surface, and each seen plugin's module, the land's with
  // its field and no unsaved stroke. The worker makes its own land from them.
  const h = holder()
  h.hold({
    layers, surfaces,
    plugins: {
      terrain3d: { url: new URL('../terrain3d/terrain3d.lod3d.ts', import.meta.url).href, held: { field, unsaved: [] } },
      shapes3d: { url: new URL('../shapes3d/shapes3d.lod3d.ts', import.meta.url).href },
    },
  })
  const batch = (lo: number, hi: number) => {
    const out: [number, number][] = []
    for (let j = lo; j <= hi; j++) for (let i = lo; i <= hi; i++) out.push([i, j])
    return out
  }
  for (const [name, tiles] of [['grove/tree', batch(8, 12)], ['grove/ferns', batch(8, 12)], ['tops', batch(-1, 1)]] as const) {
    const truth = tiles.map(([i, j]) => tile(name, layers, i, j, surfaces, behaviors, { w }))
    expect(truth.flat().length).toBeGreaterThan(10)
    expect(await h.work(name, [...tiles])).toEqual(truth)
  }
})

test('a rule on up keeps a layer to the top of a box, every cell of it, facing up', async () => {
  const w = await booted()
  const tops = around(w, 'tops', 5, 5, 2)
  expect(tops.length).toBe(24)
  for (const t of tops) { expect(t.at[1]).toBeCloseTo(22, 9); expect(t.normal).toEqual([0, 1, 0]) }
})

test('the solid rows are walker\'s circles, standing on their feet', async () => {
  const w = await booted()
  const got = solids(w, 100, 100, 30)
  expect(got.length).toBeGreaterThan(0)
  for (const g of got) { expect(g.radius).toBe(0.5); expect(g.tall).toBe(4); expect(g.base).toBeCloseTo(heightAt(w, g.x, g.z), 9) }
})

test('a layer is drawn by the words it gives: none, or one nothing delivers, throws naming the layer', async () => {
  const w = await booted()
  const { surfaces, behaviors } = geometry(w)
  const tree = (lod3d.layers.tree as Layer)
  const { mesh: _, ...bare } = tree
  const without = (layer: Layer) => ({ ...lod3d, layers: { tree: layer } })
  expect(() => check(without(bare as Layer), surfaces, behaviors, { w })).toThrow('lod3d layer tree draws nothing')
  expect(() => check(without({ ...bare, glow: {} } as Layer), surfaces, behaviors, { w })).toThrow('lod3d layer tree gives glow, which is no field of a layer and which no plugin world.lod3d.mods.behaviors names draws')
  expect(() => check(without({ ...tree, mesh: { ...tree.mesh as object, lods: [0, 1] } }), surfaces, behaviors, { w })).toThrow("lod3d layer tree's mesh lods [0,1] are not a LOD for each of up to 1 shells")
})

test('a row with its own sink sinks by it, every other row by the layer\'s; a sink that is not [base, spread] throws naming the row', async () => {
  const w = await booted()
  const { surfaces, behaviors } = geometry(w)
  const tree = lod3d.layers.tree as Layer
  const sunk: Layer = { ...tree, rows: { deep: { sink: [0.2, 0.4] }, shallow: {} }, sink: [0, 0.1] }
  const s = { ...lod3d, layers: { tree: sunk } }
  check(s, surfaces, behaviors, { w })
  const layers = layersOf(s)
  const got: Thing[] = []
  for (let j = 5; j <= 15; j++) for (let i = 5; i <= 15; i++) got.push(...tile('tree', layers, i, j, surfaces, behaviors, { w }))
  const deep = got.filter(t => t.row === 'deep'), shallow = got.filter(t => t.row === 'shallow')
  expect(deep.length).toBeGreaterThan(10)
  expect(shallow.length).toBeGreaterThan(10)
  for (const t of deep) { expect(t.sink).toBeGreaterThanOrEqual(0.2); expect(t.sink).toBeLessThan(0.6) }
  for (const t of shallow) { expect(t.sink).toBeGreaterThanOrEqual(0); expect(t.sink).toBeLessThan(0.1) }
  expect(Math.max(...deep.map(t => t.sink)) - Math.min(...deep.map(t => t.sink))).toBeGreaterThan(0.2)
  const bad = { ...lod3d, layers: { tree: { ...sunk, rows: { deep: { sink: [0.2] as unknown as [number, number] } } } } }
  expect(() => check(bad, surfaces, behaviors, { w })).toThrow('lod3d layer tree row deep sink [0.2] is not [base, spread]')
})

test('a clearing keeps every foot out of its circle round the origin and none past it, and one below 0 throws', async () => {
  const w = await booted()
  const { surfaces, behaviors } = geometry(w)
  const tree = lod3d.layers.tree as Layer
  const all = (l: Layer) => {
    const layers = layersOf({ ...lod3d, layers: { tree: l } }), out: Thing[] = []
    for (let j = -6; j <= 5; j++) for (let i = -6; i <= 5; i++) out.push(...tile('tree', layers, i, j, surfaces, behaviors, { w }))
    return out
  }
  const open = all(tree), cleared = all({ ...tree, clearing: 30 })
  const r = (t: Thing) => Math.hypot(t.at[0], t.at[2])
  expect(open.filter(t => r(t) < 30).length).toBeGreaterThan(5)
  expect(cleared.filter(t => r(t) < 30)).toEqual([])
  expect(cleared).toEqual(open.filter(t => r(t) >= 30))
  expect(() => check({ ...lod3d, layers: { tree: { ...tree, clearing: -1 } } }, surfaces, behaviors, { w })).toThrow('lod3d layer tree clearing -1 is not metres of at least 0')
})

test('lod3d stands nothing on nothing: a scene that names no mods throws, naming the key', async () => {
  const w = await booted()
  expect(() => geometry({ ...w, world: { ...w.world, lod3d: { ...lod3d, mods: {} } } } as W)).toThrow('world.lod3d.mods.surfaces names no plugin')
})
