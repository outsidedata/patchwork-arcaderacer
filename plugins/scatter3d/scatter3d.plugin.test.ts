// The browser half of scatter3d on render3d with no canvas, beside terrain3d's browser half over a
// field the test writes and a truth of the same scene, booted by scenemanager's `load`, with models
// the test builds and exports as GLBs: shells that never overflow on a random walk, LOD that changes
// only on a crossing, the model's meshes read by name and re-centred, bedding, the materials,
// boulders, `solids` against the server's, a stroke that re-takes the cells it reaches, only the slots
// written going to the GPU, a rebuild on new numbers, the land its `world.scatter3d.mods.land` names
// read the frame terrain3d makes it, a scene naming none waited on, one listing the two the wrong way
// told, and `close`.
import { afterAll, afterEach, beforeAll, expect, test, vi } from 'vitest'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import * as THREE from 'three'
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js'
import { boot, type Scene, type W } from '#engine/engine.ts'
import { load } from '#addons/scenemanager/scenemanager.addon.ts'
import { json, written } from '#plugins/loader/loader.sim.ts'
import { render3d, type Splice } from '#plugins/render3d/render3d.plugin.ts'
import { scenemanager } from '#plugins/scenemanager/scenemanager.sim.ts'
import { terrain3d } from '#plugins/terrain3d/terrain3d.plugin.ts'
import { rules, type Field, type Node } from '#plugins/terrain3d/terrain3d.sim.ts'
import { place, placed, solids, type Ground, type Pack, type Scatter } from './scatter3d.sim.ts'
import { cellKey, scatter3d, type Look } from './scatter3d.plugin.ts'

afterEach(() => { vi.restoreAllMocks() })

// ---------------------------------------------------------------- models

// Three's exporter reads its blobs back with a FileReader, which node does not have.
class Reader {
  result: ArrayBuffer | undefined
  onloadend = () => {}
  readAsArrayBuffer(b: Blob) { void b.arrayBuffer().then(r => { this.result = r; this.onloadend() }) }
}
async function glbOf(scene: THREE.Object3D) {
  vi.stubGlobal('FileReader', Reader)
  try {
    const bytes = await new GLTFExporter().parseAsync(scene, { binary: true }) as ArrayBuffer
    return await new GLTFLoader().parseAsync(bytes, '')
  } finally {
    vi.unstubAllGlobals()
  }
}
const named = (name: string, g: THREE.BufferGeometry, m: THREE.Material) => Object.assign(new THREE.Mesh(g, m), { name })

// Firs: rows tall and small, LODs 0 to 2, each LOD 0 and 1 a trunk and a crown and LOD 2 two cards
// under one repeated name, which dip half a metre below the trunk's foot. Every mesh is built upside
// down under a root turned half over about x and moved off the axis, so only the baked node
// transforms stand it up where it belongs.
const bark = new THREE.MeshStandardMaterial({ name: 'bark', color: 0x553322 })
const needles = new THREE.MeshStandardMaterial({ name: 'needles', color: 0x224422, transparent: true })
const cards = new THREE.MeshStandardMaterial({ name: 'cards', color: 0x224422, alphaTest: 0.3 })
function firs() {
  const root = new THREE.Group()
  root.rotation.x = Math.PI
  root.position.set(5, 1, -3)
  const flip = (g: THREE.BufferGeometry, y: number) => g.translate(0, y, 0).rotateX(Math.PI)
  for (const [row, h] of [['tall', 6], ['small', 3]] as const) {
    for (const lod of [0, 1]) {
      root.add(named(`${row}-${lod}-bark`, flip(new THREE.CylinderGeometry(0.3, 0.4, h, 8), h / 2), bark))
      root.add(named(`${row}-${lod}-leaf`, flip(new THREE.ConeGeometry(h / 3, h * 0.8, 12 - 4 * lod), h * 0.6), needles))
    }
    root.add(named(`${row}-2`, flip(new THREE.PlaneGeometry(h / 1.5, h), h / 2 - 0.5), cards))
    root.add(named(`${row}-2`, flip(new THREE.PlaneGeometry(h / 1.5, h).rotateY(Math.PI / 2), h / 2 - 0.5), cards))
  }
  return root
}
// Grass: one wide, low tuft, LODs 0 and 1.
const blades = new THREE.MeshStandardMaterial({ name: 'blades', color: 0x557733, transparent: true })
function clumps() {
  const root = new THREE.Group()
  root.add(named('tuft-0', new THREE.ConeGeometry(1, 0.5, 10).translate(3, 0.25, 3), blades))
  root.add(named('tuft-1', new THREE.ConeGeometry(1, 0.5, 5).translate(3, 0.25, 3), blades))
  return root
}
const models: Record<string, Awaited<ReturnType<typeof glbOf>>> = {}
beforeAll(async () => {
  models.firs = await glbOf(firs())
  models.clumps = await glbOf(clumps())
})

// ---------------------------------------------------------------- the scene

// A land record that reads the ground 8 m round, so a stroke's rect is its layer grown by 8 m.
const ANALYSIS = { slopeStep: 1.5, curveStep: 4, positionRadius: 6, occlusionRadius: 8, occlusionSteps: 4, cliffProbe: 4, cliffSlope: 0.5, cliffDrop: 7, flatAngle: 0.03, records: 50000 }
const HILLS: Node[] = [
  { id: 'hills', op: 'noise', kind: 'simplex', freq: 3, seed: 21 },
  { id: 'spawn', op: 'clearing', input: 'hills', flat: 40, floor: 0.12 },
]
const fieldOf = (more: Partial<Field> = {}): Field => ({
  program: { world: 600, hscale: 80, sea: 0.5, flood: false, out: 'spawn', nodes: HILLS },
  analysis: ANALYSIS,
  bands: [{ colour: '#3e5722', amount: 1, rules: [] }],
  grain: { base: 1, range: 0 },
  detail: [],
  surfaces: { road: { colour: '#6d6459', cover: 0 } },
  layers: [{ at: [30, 30], size: 40, px: 40, strokes: [] }],
  ...more,
})

const TREES: Pack = {
  asset: 'firs', rows: { tall: { weight: 2, solid: 0.3 }, small: { weight: 1 }, gone: { weight: 0 } },
  cell: 6, reach: 60, seed: 91, lods: [20, 40], shadow: 30, leaf: 0.5, density: 0.6, rules: [{ q: 'slope', lo: 0.6, hi: 0.3 }],
  clearing: 10, size: [0.8, 0.6], vary: 0.2,
}
const GRASS: Pack = { asset: 'clumps', rows: { tuft: { weight: 1 } }, cell: 2, reach: 16, seed: 7, lods: [8], shadow: 8, leaf: 0.5, density: 0.8, rules: [], clearing: 0, size: [0.5, 0.5], vary: 0.2 }
const ROCKS: Pack = {
  shape: { detail: 1, lumpy: [0.74, 0.36], squash: 0.72 }, colour: '#6a655e', rows: { a: { weight: 1, solid: 0.8 }, b: { weight: 1, solid: 0.8 } },
  cell: 10, reach: 50, seed: 173, lods: [], shadow: 50, leaf: 0, density: 0.4, rules: [], clearing: 0, size: [0.5, 2], vary: 0.3,
  surface: { broad: 1.4, fine: 5, lift: 0.78, range: 0.44, mix: [0.6, 0.4], moss: { from: 0.55, to: 0.95, amount: 0.4, up: [0.2, 0.8], colour: '#27401d' }, bump: 0.5, rough: 0.85 },
}
// Both halves stand on terrain3d's land, each through its mod.
const scatterOf = (packs: Record<string, Pack> = { trees: TREES }): Scatter => ({ cutout: 0.45, coverage: 0.25, budget: 1e9, remember: 100000, packs, mods: { ground: 'terrain3d', land: 'terrain3d' } })
const LISTED = ['loader', 'scenemanager', 'terrain3d', 'scatter3d', 'render3d']

// Each page's scene is a child of a manager of its own, written to the disk and booted by
// scenemanager's `load` as a game's is, so the mods its `world.scatter3d.mods` names are loaded
// before its first step. Its `probe` hands the test the child's `w`.
const DT = 1 / 60
const dir = mkdtempSync(join(tmpdir(), 'scatter3d-plugin-'))
afterAll(() => rmSync(dir, { recursive: true }))
const path = (p: string) => JSON.stringify(new URL(p, import.meta.url).pathname)

let files = 0
// `crate`, a game's own plugin of the test's, shipped beside the scenes: its mod for scatter3d hands
// back the boxes its scene's `world.crate.boxes` lists, as a car's hands back its body and wheels.
mkdirSync(join(dir, 'plugins', 'crate'), { recursive: true })
writeFileSync(join(dir, 'plugins', 'crate', 'crate.plugin.ts'), 'export function crate() { return {} }\n')
writeFileSync(join(dir, 'plugins', 'crate', 'crate.scatter3d.ts'), 'export const hollows = (plugins: any) => plugins.wire.scene.world.crate.boxes\n')

async function page(o: { field?: Field; scatter?: Scatter; plugins?: string[]; world?: Record<string, unknown> } = {}) {
  const name = `page${++files}`
  const url = `/scatter3d-plugin-test/${name}.json`
  written(url, JSON.stringify(o.field ?? fieldOf()))
  const scene: Scene = {
    world: { terrain3d: { field: 'place', rings: [{ reach: 40, seg: 10 }], shadowReach: 40, budget: 1e9, seabed: false }, scatter3d: o.scatter ?? scatterOf(), loader: { assets: { place: { type: 'json', url, preload: true } } }, ...o.world },
    prefabs: {
      engine: { dt: DT, width: 320, height: 200 },
      scenemanager: { out: {} },
      render3d: { camera: { fov: 60, near: 0.15, far: 3000, at: [0, 60, 0], look: [10, 50, 10] } },
      loader: {},
      probe: {},
    },
    actors: [{ is: 'scenemanager' }, { is: 'loader' }, { is: 'probe' }],
    plugins: o.plugins ?? LISTED,
  }
  writeFileSync(join(dir, `${name}.scene.json`), JSON.stringify(scene))
  writeFileSync(join(dir, `${name}.sim.ts`), `
import { scenemanager } from ${path('../scenemanager/scenemanager.sim.ts')}
import { loader } from ${path('../loader/loader.sim.ts')}
import file from './${name}.scene.json' with { type: 'json' }
export const sim = { scenemanager, loader, probe: { before(_me, _dt, w) { globalThis.scatter3dPlugin = w } } }
export const scene = file
`)
  const top: Scene = {
    prefabs: { engine: { dt: DT }, scenemanager: { scenes: { [name]: { file: `${name}.scene.json`, suspend: false } }, dt: DT, entry: name, port: 0 } },
    actors: [{ is: 'scenemanager' }],
    plugins: ['scenemanager'],
    seats: 1,
  }
  const t = (await load(boot(top, { scenemanager }), pathToFileURL(dir + '/').href)).get(name)!
  t.step(DT)
  const w = (globalThis as { scatter3dPlugin?: W }).scatter3dPlugin!
  // The server half's ground, from the mod the scene names for it.
  const server = placed(w)
  const asked: string[] = []
  const wire = { n: 1, rows: t.rows, scene: t.scene }
  const plugins: any = {
    wire,
    render3d: render3d(),
    terrain3d: terrain3d(),
    loader: {
      get: (name: string) => json(wire as any, name),
      load: (name: string) => { asked.push(name); return Promise.resolve() },
      ready: (name: string) => name in models,
      model: (name: string) => ({ scene: SkeletonUtils.clone(models[name].scene), animations: [] }),
    },
  }
  const me = scatter3d()
  plugins.scatter3d = me
  // A frame as the page draws one: every plugin's tick, then every afterTick in the scene's order.
  const frame = () => {
    plugins.render3d.tick(plugins)
    plugins.terrain3d.afterTick(plugins)
    me.afterTick(plugins)
  }
  const move = (x: number, z: number) => {
    plugins.render3d.tick(plugins)
    plugins.render3d.camera.position.set(x, 60, z)
  }
  move(0, 0)
  return { t, w, plugins, me, frame, move, server, asked, ground: () => plugins.terrain3d.ground as Ground }
}

const matrixOf = (look: Look, slot: number) => Array.from(look.meshes[0].instanceMatrix.array.slice(slot * 16, slot * 16 + 16))

// What each look should hold with the camera in cell (ci, cj): every kept cell of its row in its shell.
function wanted(pack: Pack, ground: Ground, ci: number, cj: number) {
  const radii = [...pack.lods.map(l => Math.ceil(l / pack.cell)), Math.ceil(pack.reach / pack.cell)]
  const R = radii[radii.length - 1]
  const out = new Map<string, string[]>()
  for (let j = cj - R; j <= cj + R; j++) for (let i = ci - R; i <= ci + R; i++) {
    const c = place(pack, i, j, ground)
    if (!c) continue
    const k = radii.findIndex(r => Math.max(Math.abs(i - ci), Math.abs(j - cj)) <= r)
    const key = `${c.row} ${k}`
    out.set(key, [...(out.get(key) ?? []), `${i} ${j}`])
  }
  for (const v of out.values()) v.sort()
  return out
}
const holding = (looks: Map<string, Look>) => {
  const out = new Map<string, string[]>()
  for (const [key, look] of looks) {
    const cells = look.held.slice(0, look.count).map(h => `${h.i} ${h.j}`).sort()
    if (cells.length) out.set(key, cells)
  }
  return out
}

// ---------------------------------------------------------------- tests

test('every look holds exactly the kept cells of its row in its shell, and never more than its shell\'s count, on a random walk', async () => {
  const p = await page({ scatter: scatterOf({ trees: TREES, grass: GRASS }) })
  let x = 0, z = 0
  for (let n = 0; n < 60; n++) {
    const jump = n % 13 === 12 ? 25 : 1
    x += Math.sin(n * 12.9898) * 7 * jump
    z += Math.cos(n * 78.233) * 7 * jump
    p.move(x, z)
    p.frame()
    for (const [name, pack] of [['trees', TREES], ['grass', GRASS]] as const) {
      const live = p.me.packs()[name]
      const ci = Math.floor(x / pack.cell), cj = Math.floor(z / pack.cell)
      expect(live.at).toEqual([ci, cj])
      expect(holding(live.looks)).toEqual(wanted(pack, p.ground(), ci, cj))
      for (const look of live.looks.values()) {
        expect(look.count).toBeLessThanOrEqual(look.cap)
        for (const m of look.meshes) expect(m.count).toBe(look.count)
        look.held.slice(0, look.count).forEach((h, s) => expect(h.slot).toBe(s))
      }
    }
  }
})

test('with no budget a frame places one new cell, nearest first, while the cells already placed change shell whole on a crossing', async () => {
  const p = await page({ scatter: { ...scatterOf(), budget: 0 } })
  p.frame()
  const live = p.me.packs().trees
  const R = Math.ceil(TREES.reach / TREES.cell)
  const seen = new Set<unknown>()
  let last = 0
  for (let n = 1; n <= (2 * R + 1) ** 2; n++) {
    expect(live.held.size).toBe(n)
    const fresh = [...live.held.values()].filter(h => !seen.has(h))
    expect(fresh).toHaveLength(1)
    seen.add(fresh[0])
    const d = Math.max(Math.abs(fresh[0].i), Math.abs(fresh[0].j))
    expect(d).toBeGreaterThanOrEqual(last)
    last = d
    p.frame()
  }
  expect(holding(live.looks)).toEqual(wanted(TREES, p.ground(), 0, 0))
  // A crossing: every placed cell is in its new shell at once, and only the cells new to reach wait.
  p.move(6.5, 0.5)
  p.frame()
  const want = wanted(TREES, p.ground(), 1, 0), got = holding(live.looks)
  for (const [key, cells] of got) for (const c of cells) expect(want.get(key)).toContain(c)
  const waiting = [...want.values()].flat().filter(c => ![...got.values()].flat().includes(c))
  expect(waiting.length).toBeGreaterThan(0)
  for (const c of waiting) expect(Number(c.split(' ')[0])).toBe(1 + R)
  // Back two cells before they are placed: the ones that fell out of reach are never placed.
  p.move(-5.5, 0.5)
  for (let n = 0; n < 3 * (2 * R + 1); n++) {
    p.frame()
    for (const h of live.held.values()) expect(Math.max(Math.abs(h.i + 1), Math.abs(h.j))).toBeLessThanOrEqual(R)
  }
  expect(holding(live.looks)).toEqual(wanted(TREES, p.ground(), -1, 0))
})

test('a shell is a square ring of cells out to its lod, each look as big as its shell, casting shadows when it ends within `shadow`', async () => {
  const p = await page()
  p.frame()
  const looks = p.me.packs().trees.looks
  // Shells out to 4, 7 and 10 cells: 9², 15² − 9² and 21² − 15² cells.
  expect([0, 1, 2].map(k => looks.get(`tall ${k}`)!.cap)).toEqual([81, 144, 216])
  expect([0, 1, 2].map(k => looks.get(`small ${k}`)!.meshes[0].castShadow)).toEqual([true, false, false])
  expect(looks.has('gone 0')).toBe(false)
  // LOD k is drawn in shell k, each of its parts a mesh of the look.
  expect(looks.get('tall 0')!.meshes.map(m => m.name)).toEqual(['tall-0-bark', 'tall-0-leaf'])
  expect(looks.get('tall 2')!.meshes).toHaveLength(2)
})

test('a cell changes LOD only when the camera crosses a cell', async () => {
  const p = await page()
  p.move(3.2, 3.2)
  p.frame()
  const live = p.me.packs().trees
  const before = new Map([...live.looks].map(([k, l]) => [k, l.held.slice(0, l.count).map((h, s) => [h, matrixOf(l, s)])]))
  for (const [x, z] of [[0.1, 0.1], [5.9, 5.9], [0.1, 5.9], [4, 1]]) {
    p.move(x, z)
    p.frame()
    for (const [k, l] of live.looks) expect(l.held.slice(0, l.count).map((h, s) => [h, matrixOf(l, s)])).toEqual(before.get(k))
  }
  p.move(6.1, 0.1)
  p.frame()
  expect(live.at).toEqual([1, 0])
  const moved = [...live.looks].some(([k, l]) => l.held.slice(0, l.count).some(h => !before.get(k)!.some(([g]) => g === h)))
  expect(moved).toBe(true)
})

test('refused cells are remembered, and a cell once taken is not placed again while it stays in reach', async () => {
  const p = await page()
  p.frame()
  const live = p.me.packs().trees
  const near = [...live.held.values()].filter(h => Math.abs(h.i) < 5 && Math.abs(h.j) < 5)
  const refused = near.find(h => !h.cell)!
  const kept = near.find(h => h.cell)!
  expect(refused).toBeDefined()
  p.move(6.5, 6.5)
  p.frame()
  expect(live.held.get(cellKey(refused.i, refused.j))).toBe(refused)
  expect(live.held.get(cellKey(kept.i, kept.j))).toBe(kept)
  expect(live.held.size).toBe(21 * 21)
})

test('meshes are read by name, repeated names\' _n included, and every LOD of a row moves by one offset onto the axis, standing on y = 0', async () => {
  const p = await page()
  p.frame()
  const { models: ms } = p.me.packs().trees
  const box = (parts: { geometry: THREE.BufferGeometry }[]) => {
    const b = new THREE.Box3()
    for (const part of parts) { part.geometry.computeBoundingBox(); b.union(part.geometry.boundingBox!) }
    return b
  }
  const tall = ms.tall.lods
  expect(tall.map(l => l.length)).toEqual([2, 2, 2])
  const b0 = box(tall[0])
  expect(b0.min.y).toBeCloseTo(0, 5)
  expect((b0.min.x + b0.max.x) / 2).toBeCloseTo(0, 5)
  expect((b0.min.z + b0.max.z) / 2).toBeCloseTo(0, 5)
  // Upright: the trunk's foot at 0 and the crown's tip at 6 m.
  expect(b0.max.y).toBeCloseTo(6, 5)
  // LOD 1 is LOD 0's twin; LOD 2 moved by LOD 0's offset, its cards on the same spot and dipping
  // below it as they were built to.
  expect(box(tall[1]).min.y).toBeCloseTo(0, 5)
  expect(box(tall[2]).min.y).toBeCloseTo(-0.5, 5)
  expect(Math.abs((box(tall[2]).min.x + box(tall[2]).max.x) / 2)).toBeLessThan(1e-5)
  // The loader's own model is left as it was.
  const theirs = new THREE.Box3().setFromObject(models.firs.scene)
  expect(theirs.min.x).toBeGreaterThan(1)
})

test('a row drawn with no mesh for one of its LODs throws naming it; a row of weight 0 needs none', async () => {
  const p = await page({ scatter: scatterOf({ trees: { ...TREES, rows: { tall: { weight: 1 }, gone: { weight: 0 } }, lods: [20, 40, 50] } }) })
  expect(() => p.frame()).toThrow('scatter3d pack trees row tall has no LOD 3 in firs')
  const q = await page({ scatter: scatterOf({ trees: { ...TREES, rows: { tall: { weight: 1 }, missing: { weight: 0 } } } }) })
  expect(() => q.frame()).not.toThrow()
})

test('the model is asked for once and nothing is drawn until it has landed', async () => {
  const p = await page({ scatter: scatterOf({ trees: { ...TREES, asset: 'later' } }) })
  p.frame()
  p.frame()
  expect(p.asked).toEqual(['later'])
  expect(p.me.packs().trees).toBeUndefined()
  models.later = models.firs
  p.frame()
  expect(p.me.packs().trees.held.size).toBe(21 * 21)
  delete models.later
})

test('BLEND materials become cutout, cards bend toward the sky and gain coverage, and every material is dressed and its own', async () => {
  const p = await page({ scatter: scatterOf({ trees: TREES, grass: GRASS }) })
  const dress = vi.spyOn(p.plugins.render3d, 'dress')
  p.frame()
  const { trees, grass } = p.me.packs()
  const mats = (live: typeof trees) => new Map([...live.looks.values()].flatMap(l => l.meshes.map(m => [(m.material as THREE.Material).name, m.material as THREE.MeshStandardMaterial])))
  const t = mats(trees), g = mats(grass)
  expect(t.get('needles')!.transparent).toBe(false)
  expect(t.get('needles')!.alphaTest).toBe(0.45)
  expect(t.get('needles')!.depthWrite).toBe(true)
  expect(t.get('cards')!.alphaTest).toBeCloseTo(0.3, 5)
  expect(t.get('bark')!.alphaTest).toBe(0)
  expect(g.get('blades')!.alphaTest).toBe(0.45)
  for (const m of [...t.values(), ...g.values()]) expect(dress.mock.calls.some(([d]) => d === m)).toBe(true)
  const surfaceOf = (m: THREE.Material) => (dress.mock.calls.find(([d]) => d === m)![1] as { surface?: Splice } | undefined)?.surface
  expect(surfaceOf(t.get('bark')!)).toBeUndefined()
  const card = surfaceOf(t.get('needles')!)!
  expect(card.fragment!.normal_fragment_maps).toContain('0.500000')
  expect(card.fragment!.alphamap_fragment).toContain('0.250000')
  // The loader's materials are the model's, untouched.
  expect(needles.transparent).toBe(true)
  let theirs: THREE.Material | undefined
  models.firs.scene.traverse(o => { if ((o as THREE.Mesh).isMesh && o.name === 'tall-0-leaf') theirs = (o as THREE.Mesh).material as THREE.Material })
  expect(theirs!.transparent).toBe(true)
  expect(theirs).not.toBe(t.get('needles'))
})

// A page whose scatter is handed `boxes` by crate's hollows mod, holding at most `cap` of them.
const hollowed = (boxes: unknown[], cap: number | undefined = 4) => page({
  scatter: { ...scatterOf({ trees: TREES, grass: GRASS }), hollows: cap, mods: { ground: 'terrain3d', land: 'terrain3d', hollows: ['crate'] } },
  world: { shipped: { plugins: ['crate'] }, crate: { boxes } },
  plugins: ['loader', 'scenemanager', 'terrain3d', 'shipped', 'scatter3d', 'render3d'],
})
// Every material of a page's field, and the surface each was dressed with.
const dressed = (p: Awaited<ReturnType<typeof page>>) => {
  const dress = vi.spyOn(p.plugins.render3d, 'dress')
  p.frame()
  return [...Object.values(p.me.packs())].flatMap(l => [...l.looks.values()].flatMap(look => look.meshes.map(m => m.material as THREE.Material)))
    .map(m => ({ m, surface: (dress.mock.calls.find(([d]) => d === m)![1] as { surface?: Splice }).surface }))
}

test('with a hollows mod every material of the field drops a fragment inside any box handed to it, beside its own surface; with none, no material carries it', async () => {
  const all = dressed(await hollowed([]))
  expect(all.length).toBeGreaterThan(3)
  for (const { surface } of all) {
    expect(surface!.fragment!.common).toContain('uniform mat4 scHollow[ 4 ];')
    expect(surface!.fragment!.clipping_planes_fragment).toContain('discard;')
  }
  // A card keeps its own surface too, its coverage and its normal.
  const card = all.find(({ m }) => m.name === 'needles')!.surface!
  expect(card.fragment!.normal_fragment_maps).toContain('0.500000')
  // Every material shares the one set of uniforms, which a frame writes.
  const uniforms = new Set(all.map(({ surface }) => (surface!.uniforms as { scHollow: unknown }).scHollow))
  expect(uniforms.size).toBe(1)
  // The glsl compiles into three's own standard shader at the chunks it names.
  const shader = { uniforms: {}, vertexShader: THREE.ShaderLib.standard.vertexShader, fragmentShader: THREE.ShaderLib.standard.fragmentShader } as any
  const bark = all.find(({ m }) => m.name === 'bark')!.m
  bark.onBeforeCompile(shader, undefined as any)
  expect(shader.fragmentShader).toMatch(/#include <clipping_planes_fragment>\nfor \( int k = 0; k < 4; k \+\+ \)/)
  expect(shader.uniforms.scHollow.value).toHaveLength(4)
  for (const { surface } of dressed(await page({ scatter: scatterOf({ trees: TREES, grass: GRASS }) }))) expect(surface?.fragment?.clipping_planes_fragment).toBeUndefined()
})

test('each frame the boxes nearest the camera, at most `hollows` of them, are written as the matrices that take a world point into each box\'s own cube', async () => {
  const turned = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), 0.6).toArray()
  // The camera is at [0, 60, 0]: five boxes, the far one past the four it holds.
  const boxes = [
    { at: [3, 50, 0], rot: turned, half: [2, 1, 0.5] },
    { at: [500, 0, 0], rot: [0, 0, 0, 1], half: [1, 1, 1] },
    { at: [0, 55, 4], rot: [0, 0, 0, 1], half: [1, 2, 3] },
    { at: [-6, 52, -2], rot: [0, 0, 0, 1], half: [0.4, 0.4, 0.2] },
    { at: [10, 60, 10], rot: [0, 0, 0, 1], half: [1, 1, 1] },
  ]
  const p = await hollowed(boxes)
  const all = dressed(p)
  const u = all[0].surface!.uniforms as { scHollow: { value: THREE.Matrix4[] }; scHollows: { value: number } }
  expect(u.scHollows.value).toBe(4)
  // Nearest first: 6.4 m, 10.2, 10.4 and 14.1.
  const near = [boxes[2], boxes[3], boxes[0], boxes[4]]
  near.forEach((b, k) => {
    const m = u.scHollow.value[k]
    // Its middle to the cube's, a corner to the cube's corner, a point just past a face out of it.
    expect(new THREE.Vector3(...b.at).applyMatrix4(m).length()).toBeLessThan(1e-9)
    const corner = new THREE.Vector3(...b.half).applyQuaternion(new THREE.Quaternion(...b.rot)).add(new THREE.Vector3(...b.at))
    const c = corner.applyMatrix4(m)
    for (const v of [c.x, c.y, c.z]) expect(v).toBeCloseTo(1, 9)
    const past = new THREE.Vector3(b.half[0] * 1.01, 0, 0).applyQuaternion(new THREE.Quaternion(...b.rot)).add(new THREE.Vector3(...b.at)).applyMatrix4(m)
    expect(Math.abs(past.x)).toBeGreaterThan(1)
  })
  // Fewer boxes the next frame: only those are in use.
  ;(p.t.scene.world as any).crate.boxes = boxes.slice(0, 2)
  p.frame()
  expect(u.scHollows.value).toBe(2)
})

test('a hollows mod with no whole `hollows` above 0, or naming a plugin the scene does not list, throws on the first frame', async () => {
  for (const cap of [0, 2.5]) {
    await expect(hollowed([], cap).then(p => p.frame())).rejects.toThrow(`scatter3d is handed hollows, and world.scatter3d.hollows ${cap} is not a whole number above 0, the most it clears at once`)
  }
  const unlisted = await page({
    scatter: { ...scatterOf(), hollows: 2, mods: { ground: 'terrain3d', land: 'terrain3d', hollows: ['crate'] } },
    world: { shipped: { plugins: ['crate'] }, crate: { boxes: [] } },
  })
  expect(() => unlisted.frame()).toThrow('scatter3d\'s hollows is crate\'s, which this scene does not list')
})

// A ground the test hands in place of terrain3d's: `height` as given plus `lift`, every cell kept
// unless `cover` says otherwise, and edits that report whatever the test sets. It counts the heights
// and covers asked of it.
async function onGround(pack: Pack, height: (x: number, z: number) => number, cover: (x: number, z: number) => number = () => 1) {
  const p = await page({ scatter: scatterOf({ it: { ...pack, rules: [], density: 1, clearing: 0 } }) })
  const state = { lift: 0, heights: 0, covers: 0, land: {}, layers: [] as { version: number; rect: number[] }[] }
  p.plugins.terrain3d = {
    afterTick() {},
    ground: {
      height: (x: number, z: number) => { state.heights++; return height(x, z) + state.lift },
      cover: (x: number, z: number) => { state.covers++; return cover(x, z) },
      ramp: () => 1, rules, edits: () => ({ land: state.land, layers: state.layers }),
    },
  }
  p.frame()
  return { p, state }
}
// A held cell's matrix taken apart.
const parts = (m: Float32Array) => {
  const pos = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3()
  new THREE.Matrix4().fromArray(m).decompose(pos, q, s)
  return { pos, q, s, up: new THREE.Vector3(0, 1, 0).applyQuaternion(q) }
}

test('bedding: a low tuft lies along the slope and touches it at its edge; a fir stands straight and touches at its foot', async () => {
  const rise = 0.4, normal = new THREE.Vector3(-rise, 1, 0).normalize()
  const g = (await onGround(GRASS, x => rise * x)).p
  const tuft = g.me.packs().it
  expect(tuft.models.tuft.lean).toBe(1)
  for (const h of [...tuft.held.values()].slice(0, 20)) {
    const { pos, up, s } = parts(h.m!)
    expect(up.dot(normal)).toBeCloseTo(1, 5)
    expect(s.x).toBeCloseTo(h.cell!.size, 5)
    // Its base ring lies in the plane, which is where it touches: its middle is on the ground.
    expect(pos.y).toBeCloseTo(rise * pos.x, 4)
  }
  const f = (await onGround(TREES, x => rise * x)).p
  const fir = f.me.packs().it
  const { foot, edge, rise: height, lean } = fir.models.tall
  expect(lean).toBeCloseTo(foot / height, 12)
  expect(lean).toBeLessThan(0.1)
  expect(edge).toBeGreaterThanOrEqual(foot)
  for (const h of [...fir.held.values()].filter(h => h.cell?.row === 'tall').slice(0, 20)) {
    const { pos, q, up } = parts(h.m!)
    const tilt = Math.atan2(Math.hypot(up.x, up.z), up.y), slope = Math.atan2(Math.hypot(normal.x, normal.z), normal.y)
    expect(tilt).toBeCloseTo(lean * slope, 5)
    // Tilted toward the slope's normal, never away from it.
    expect(up.x).toBeLessThanOrEqual(0)
    // The ring it is sunk by, (foot + lean·(edge − foot))·size about its axis and tilted with it: its
    // highest point over the ground is on it.
    const r = (foot + lean * (edge - foot)) * h.cell!.size
    let top = -Infinity
    for (let k = 0; k < 3600; k++) {
      const a = (k / 3600) * 2 * Math.PI
      const v = new THREE.Vector3(r * Math.cos(a), 0, r * Math.sin(a)).applyQuaternion(q).add(pos)
      top = Math.max(top, v.y - rise * v.x)
    }
    expect(top).toBeCloseTo(0, 4)
  }
})

// The 8 points of a held cell's sink ring, as the header defines them: the plane fitted to the ground
// 8 points foot·size round, its downhill, and the ring of (foot + lean·(edge − foot))·size about the
// instance's tilted axis, starting straight downhill; each point's height over the ground.
function ringGaps(h: { cell?: { x: number; z: number; size: number; yaw: number }; m?: Float32Array }, model: { foot: number; edge: number; lean: number }, height: (x: number, z: number) => number, n = 8) {
  const c = h.cell!, f = model.foot * c.size
  let sx = 0, sz = 0
  for (let k = 0; k < 8; k++) {
    const dx = f * Math.cos((k * Math.PI) / 4), dz = f * Math.sin((k * Math.PI) / 4), y = height(c.x + dx, c.z + dz)
    sx += y * dx
    sz += y * dz
  }
  const down = Math.atan2(-sz, -sx)
  const { pos, q } = parts(h.m!)
  const tilt = q.clone().multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -c.yaw))
  const r = (model.foot + model.lean * (model.edge - model.foot)) * c.size
  return Array.from({ length: n }, (_, k) => {
    const t = down + (k * 2 * Math.PI) / n
    const v = new THREE.Vector3(r * Math.cos(t), 0, r * Math.sin(t)).applyQuaternion(tilt).add(pos)
    return v.y - height(v.x, v.z)
  })
}

test('the sink ring starts straight downhill wherever the slope faces', async () => {
  const rise = 0.4, a = 0.3, gx = rise * Math.cos(a), gz = rise * Math.sin(a)
  const height = (x: number, z: number) => gx * x + gz * z
  const fir = (await onGround(TREES, height)).p.me.packs().it
  const tall = [...fir.held.values()].filter(h => h.cell?.row === 'tall').slice(0, 10)
  expect(tall.length).toBe(10)
  for (const h of tall) {
    const gaps = ringGaps(h, fir.models.tall, height, 3600)
    // On a plane the ring's highest point over the ground is downhill, the first of the eight.
    expect(Math.max(...gaps)).toBeCloseTo(0, 4)
    expect(gaps[0]).toBeCloseTo(0, 4)
  }
})

test('on curved ground the sink is the largest gap of the eight points round the ring, and a gap between them is small', async () => {
  const height = (x: number, z: number) => 1.5 * Math.sin(x / 3) * Math.sin(z / 3)
  const tuft = (await onGround(GRASS, height)).p.me.packs().it
  let between = 0
  for (const h of [...tuft.held.values()].filter(h => h.cell)) {
    const eight = ringGaps(h, tuft.models.tuft, height)
    expect(Math.max(...eight)).toBeCloseTo(0, 4)
    between = Math.max(between, ...ringGaps(h, tuft.models.tuft, height, 360))
  }
  // Four points, a quarter turn apart, leave a tuft 6.5 cm up somewhere on this ground; eight leave
  // 1.5 cm.
  expect(between).toBeLessThan(0.03)
})

test('foot is the mean distance from the axis of LOD 0\'s vertices in its bottom tenth, and edge their largest', async () => {
  const m = (await onGround(TREES, () => 0)).p.me.packs().it.models.tall
  let sum = 0, n = 0, edge = 0
  for (const part of m.lods[0]) {
    const a = part.geometry.getAttribute('position')
    for (let v = 0; v < a.count; v++) {
      if (a.getY(v) > 0.1 * m.rise || a.getY(v) < 0) continue
      const d = Math.hypot(a.getX(v), a.getZ(v))
      sum += d
      n++
      edge = Math.max(edge, d)
    }
  }
  expect(m.rise).toBeCloseTo(6, 5)
  expect(m.foot).toBeCloseTo(sum / n, 9)
  expect(m.edge).toBeCloseTo(edge, 9)
  expect(m.lean).toBeCloseTo(m.foot / 6, 9)
})

test('boulders: each variant its own hashed icosahedron, the same every build, its middle on the ground so half of it is buried, in every shell', async () => {
  const p = await page({ scatter: scatterOf({ rocks: ROCKS }) })
  p.frame()
  const { models: ms, looks } = p.me.packs().rocks
  const posOf = (row: string) => Array.from(ms[row].lods[0][0].geometry.getAttribute('position').array)
  expect(posOf('a')).not.toEqual(posOf('b'))
  const q = await page({ scatter: scatterOf({ rocks: ROCKS }) })
  q.frame()
  expect(Array.from(q.me.packs().rocks.models.a.lods[0][0].geometry.getAttribute('position').array)).toEqual(posOf('a'))
  const b = new THREE.Box3().setFromBufferAttribute(ms.a.lods[0][0].geometry.getAttribute('position') as THREE.BufferAttribute)
  const { lumpy, squash } = ROCKS.shape!
  for (const y of [b.max.y, -b.min.y]) {
    expect(y).toBeGreaterThanOrEqual(squash * lumpy[0] - 1e-9)
    expect(y).toBeLessThanOrEqual(squash * (lumpy[0] + lumpy[1]) + 1e-9)
  }
  for (const x of [b.max.x, -b.min.x]) expect(x).toBeGreaterThan(lumpy[0] - 1e-9)
  // Every vertex the icosahedron shares between faces is moved alike, so it has no cracks.
  const at = new Map<string, string>(), pos = ms.a.lods[0][0].geometry.getAttribute('position')
  expect(ms.a.lods[0][0].geometry.index).toBeNull()
  const ico = new THREE.IcosahedronGeometry(1, ROCKS.shape!.detail).getAttribute('position')
  for (let v = 0; v < ico.count; v++) {
    const key = [ico.getX(v), ico.getY(v), ico.getZ(v)].map(c => c.toFixed(4)).join()
    const got = [pos.getX(v), pos.getY(v), pos.getZ(v)].map(c => c.toFixed(6)).join()
    if (at.has(key)) expect(got).toBe(at.get(key))
    at.set(key, got)
  }
  expect(looks.get('a 0')!.meshes[0].castShadow).toBe(true)
  expect([...looks.keys()].sort()).toEqual(['a 0', 'b 0'])
})

test('the browser\'s solids are the server\'s, and are the kept solid instances it draws', async () => {
  const p = await page({ scatter: scatterOf({ trees: TREES, rocks: ROCKS }) })
  p.move(12, -7)
  p.frame()
  const byPlace = (s: { x: number; z: number; radius: number }[]) => [...s].sort((a, b) => a.x - b.x || a.z - b.z)
  for (const [x, z, r] of [[12, -7, 20], [40, 30, 15], [-200, 90, 25], [0, 0, 3]]) {
    const mine = p.me.solids(x, z, r)
    expect(byPlace(mine)).toEqual(byPlace(solids(p.w, x, z, r, p.server)))
    if (r >= 15) expect(mine.length).toBeGreaterThan(0)
  }
  // Each one near the camera is an instance of a drawn look, at the matrix's x and z.
  const drawn: number[][] = []
  for (const live of Object.values(p.me.packs())) for (const look of live.looks.values()) {
    for (let s = 0; s < look.count; s++) { const m = matrixOf(look, s); drawn.push([m[12], m[14]]) }
  }
  for (const s of p.me.solids(12, -7, 20)) expect(drawn.some(([x, z]) => Math.abs(x - s.x) < 1e-3 && Math.abs(z - s.z) < 1e-3)).toBe(true)
})

test('a stroke re-takes the held cells whose footprint it reaches: raised trees rise and stay the same trees, a road refuses them, the rest keep their matrices', async () => {
  const p = await page({ scatter: scatterOf({ trees: { ...TREES, rules: [], density: 1 } }) })
  p.move(30, 30)
  p.frame()
  const live = p.me.packs().trees
  const snap = () => new Map([...live.held.values()].filter(h => h.cell).map(h => [`${h.i} ${h.j}`, { h, cell: h.cell, m: Array.from(h.m!) }]))
  const before = snap()
  const land = p.plugins.terrain3d.land
  land.stroke(0, { verb: 'raise', radius: 8, hardness: 1, strength: 3, level: 0, surface: '', path: [[30, 30]] })
  p.frame()
  const after = snap()
  const rect = land.rect(0)
  const grow = Math.max(live.models.tall.edge, live.models.small.edge) * (TREES.size[0] + TREES.size[1])
  let raised = 0, kept = 0
  for (const [key, was] of before) {
    const now = after.get(key)!
    expect(now.h).toBe(was.h)
    const reached = was.h.i * 6 - grow <= rect[2] && (was.h.i + 1) * 6 + grow >= rect[0] && was.h.j * 6 - grow <= rect[3] && (was.h.j + 1) * 6 + grow >= rect[1]
    if (!reached) { expect(now.m).toEqual(was.m); expect(now.cell).toBe(was.cell); kept++; continue }
    expect(now.cell).toEqual(was.cell)
    if (Math.hypot(was.cell!.x - 30, was.cell!.z - 30) < 6) { expect(now.m[13]).toBeCloseTo(was.m[13] + 3, 1); raised++ }
  }
  expect(raised).toBeGreaterThan(0)
  expect(kept).toBeGreaterThan(100)
  land.stroke(0, { verb: 'surface', radius: 10, hardness: 1, strength: 0, level: 0, surface: 'road', path: [[30, 30]] })
  p.frame()
  const road = [...live.held.values()].filter(h => Math.hypot((h.i + 0.5) * 6 - 30, (h.j + 0.5) * 6 - 30) < 5)
  expect(road.length).toBeGreaterThan(0)
  for (const h of road) { expect(h.cell).toBeUndefined(); expect(h.look).toBeUndefined() }
  expect(holding(live.looks)).toEqual(wanted({ ...TREES, rules: [], density: 1 }, p.ground(), 5, 5))
})

test('a stroke\'s rect outside a cell\'s square but within edge·(base + spread) of it re-takes the cell; one past it does not', async () => {
  const { p, state } = await onGround(GRASS, () => 0)
  const live = p.me.packs().it
  const grow = live.models.tuft.edge * (GRASS.size[0] + GRASS.size[1])
  expect(grow).toBeGreaterThan(0.5)
  state.layers = [{ version: 0, rect: [100, 100, 101, 101] }]
  p.frame()
  // A strip just right of the x = 0 cell line, from a quarter of `grow` past it to a half.
  const x0 = 0.25 * grow, x1 = 0.5 * grow, c = GRASS.cell
  const snap = () => new Map([...live.held.values()].filter(h => h.cell).map(h => [h, h.m![13]]))
  const before = snap()
  state.lift = 1
  state.layers = [{ version: 1, rect: [x0, -1000, x1, 1000] }]
  p.frame()
  let gap = 0, far = 0
  for (const [h, y] of before) {
    const meets = h.i * c - grow <= x1 && (h.i + 1) * c + grow >= x0
    expect(h.m![13]).toBeCloseTo(meets ? y + 1 : y, 5)
    // Cell −1 ends at x = 0: its square misses the rect, its grown square meets it.
    if (h.i === -1) gap++
    if (!meets) far++
  }
  expect(gap).toBeGreaterThan(0)
  expect(far).toBeGreaterThan(0)
})

test('only the slots of a look written and still drawn go to the GPU, and they wait for the renderer across a frame it does not draw', async () => {
  const p = await page({ scatter: scatterOf({ trees: { ...TREES, rules: [], density: 1 }, grass: GRASS }) })
  p.move(30, 30)
  p.frame()
  const land = p.plugins.terrain3d.land
  // Each instance array's slots written through its `set`, `fill` and `copyWithin`, the only ways the
  // plugin writes one, and `due`, the written ones drawn when their frame ended that the renderer has
  // not sent yet.
  const tracked = Object.values(p.me.packs()).flatMap(l => [...l.looks.values()]).flatMap(look => look.meshes.flatMap(m =>
    ([[m.instanceMatrix, 16], [m.instanceColor!, 3]] as const).map(([attribute, n]) => {
      const t = { look, attribute, n, written: new Set<number>(), due: new Set<number>(), version: attribute.version }
      const a = attribute.array as Float32Array
      a.set = (src, at = 0) => { t.written.add(at / n); Float32Array.prototype.set.call(a, src, at) }
      a.fill = (v, at = 0, end) => { t.written.add(at / n); return Float32Array.prototype.fill.call(a, v, at, end) }
      a.copyWithin = (to, from, end) => { t.written.add(to / n); return Float32Array.prototype.copyWithin.call(a, to, from, end) }
      return t
    })))
  // What the renderer does once it has sent an attribute's ranges.
  const send = () => { for (const t of tracked) { t.attribute.clearUpdateRanges(); t.due.clear() } }
  send()
  let gaps = 0, undrawn = 0, waited = 0
  for (let n = 0; n < 24; n++) {
    const x = 30 + 12 * Math.sin(n * 1.7), z = 30 + 12 * Math.cos(n * 2.3)
    if (n % 4 === 1) land.stroke(0, { verb: 'raise', radius: 6, hardness: 1, strength: 2, level: 0, surface: '', path: [[x, z]] })
    if (n % 4 === 3) land.stroke(0, { verb: 'surface', radius: 6, hardness: 1, strength: 0, level: 0, surface: 'road', path: [[60 - x, 60 - z]] })
    p.move(x, z)
    p.frame()
    for (const t of tracked) {
      let fresh = 0
      for (const s of t.written) {
        if (s >= t.look.count) { undrawn++; continue }
        if (t.due.has(s)) waited++
        t.due.add(s)
        fresh++
      }
      t.written.clear()
      // The ranges cover whole slots, and exactly the due ones: no slot between two of them, none
      // past the count, and none written before the renderer last sent.
      const sent = new Set<number>()
      for (const { start, count } of t.attribute.updateRanges) {
        expect(start % t.n).toBe(0)
        expect(count % t.n).toBe(0)
        for (let s = start / t.n; s < (start + count) / t.n; s++) sent.add(s)
      }
      const due = [...t.due].sort((a, b) => a - b)
      expect([...sent].sort((a, b) => a - b)).toEqual(due)
      if (due.length && due[due.length - 1] - due[0] + 1 > due.length) gaps++
      // A new version with no range sends the whole buffer, so one comes only with a fresh slot.
      expect(t.attribute.version !== t.version).toBe(fresh > 0)
      t.version = t.attribute.version
    }
    // Every third frame goes undrawn, and its ranges wait for the next.
    if (n % 3 !== 2) send()
  }
  // The frames wrote slots apart from one another, a slot a leaving cell moved into and then gave up,
  // and a slot again before the renderer sent it.
  expect(gaps).toBeGreaterThan(0)
  expect(undrawn).toBeGreaterThan(0)
  expect(waited).toBeGreaterThan(0)
})

test('a crossing places only the cells new to reach, refused ones held from before are not asked again', async () => {
  const { p, state } = await onGround(TREES, () => 0, x => (Math.sin(x * 7.3) > 0 ? 1 : 0))
  const R = Math.ceil(TREES.reach / TREES.cell)
  expect([...p.me.packs().it.held.values()].filter(h => !h.cell).length).toBeGreaterThan(100)
  state.covers = 0
  p.move(6.5, 0.5)
  p.frame()
  expect(state.covers).toBe(2 * R + 1)
})

test('a crossing asks only the rings of cells whose shell can change, not the whole field', async () => {
  const pack = { ...TREES, reach: 300 }
  const { p } = await onGround(pack, () => 0)
  const live = p.me.packs().it
  const R = Math.ceil(pack.reach / pack.cell)
  expect(live.held.size).toBe((2 * R + 1) ** 2)
  const get = live.held.get.bind(live.held)
  let asked = 0
  live.held.get = (key: number) => { asked++; return get(key) }
  p.move(6.5, -0.5)
  p.frame()
  // A move of one cell asks the rings from r to r + 1 cells out round each shell's radius r.
  const rings = [...pack.lods.map(l => Math.ceil(l / pack.cell)), R].reduce((n, r) => n + 8 * r + 8 * (r + 1), 0)
  expect(asked).toBe(rings)
  expect(holding(live.looks)).toEqual(wanted({ ...pack, rules: [], density: 1, clearing: 0 }, p.ground(), 1, -1))
})

test('a new land places every held cell again', async () => {
  const p = await page()
  p.frame()
  const live = p.me.packs().trees
  const a = [...live.held.values()].find(h => h.cell)!
  const m = Array.from(a.m!)
  written(p.plugins.wire.scene.world!.loader.assets.place.url, JSON.stringify(fieldOf({ program: { ...fieldOf().program, hscale: 120 } })))
  p.frame()
  expect(p.me.packs().trees).toBe(live)
  expect(holding(live.looks)).toEqual(wanted(TREES, p.ground(), 0, 0))
  const again = live.held.get(cellKey(a.i, a.j))!
  if (again.cell) expect(Array.from(again.m!)).not.toEqual(m)
})

test('the field is built again when the scene\'s `world.scatter3d` changes, compared by content', async () => {
  const p = await page()
  p.frame()
  const live = p.me.packs().trees
  const world = p.plugins.wire.scene.world
  world.scatter3d = structuredClone(world.scatter3d)
  p.frame()
  expect(p.me.packs().trees).toBe(live)
  const mesh = live.looks.get('tall 0')!.meshes[0]
  expect(p.plugins.render3d.scene.children).toContain(mesh)
  world.scatter3d.packs.trees.density = 0.1
  p.frame()
  const next = p.me.packs().trees
  expect(next).not.toBe(live)
  expect(p.plugins.render3d.scene.children).not.toContain(mesh)
  expect(holding(next.looks)).toEqual(wanted({ ...TREES, density: 0.1 }, p.ground(), 0, 0))
})

test('the land is read in the afterTick of the frame terrain3d makes it: the first frame draws on it', async () => {
  const p = await page()
  expect(p.plugins.terrain3d.ground).toBeUndefined()
  p.frame()
  expect(p.me.packs().trees.held.size).toBe(21 * 21)
  expect(holding(p.me.packs().trees.looks)).toEqual(wanted(TREES, p.ground(), 0, 0))
})

test('a scene that names no land draws nothing and waits, its solids none', async () => {
  const p = await page({ scatter: { ...scatterOf(), mods: { ground: 'terrain3d' } } })
  for (let n = 0; n < 3; n++) expect(() => p.frame()).not.toThrow()
  expect(p.plugins.terrain3d.ground).toBeDefined()
  expect(p.me.packs()).toEqual({})
  expect(p.me.solids(0, 0, 50)).toEqual([])
})

test('a scene listing scatter3d before the plugin whose land it reads, or not listing that plugin, throws saying so', async () => {
  const before = await page({ plugins: ['loader', 'scenemanager', 'scatter3d', 'terrain3d', 'render3d'] })
  expect(() => before.frame()).toThrow('scatter3d is listed before terrain3d, whose land it reads that frame')
  const unlisted = await page({ plugins: ['loader', 'scenemanager', 'scatter3d', 'render3d'] })
  expect(() => unlisted.frame()).toThrow('scatter3d\'s land is terrain3d\'s, which this scene does not list')
})

test('close takes every look off the scene and disposes its meshes, geometries and materials', async () => {
  const p = await page({ scatter: scatterOf({ trees: TREES, rocks: ROCKS }) })
  p.frame()
  const meshes = Object.values(p.me.packs()).flatMap(l => [...l.looks.values()].flatMap(k => k.meshes))
  const disposed = new Set<unknown>()
  for (const m of meshes) {
    m.geometry.addEventListener('dispose', () => disposed.add(m.geometry))
    ;(m.material as THREE.Material).addEventListener('dispose', () => disposed.add(m.material))
    m.addEventListener('dispose', () => disposed.add(m))
  }
  p.me.close()
  for (const m of meshes) {
    expect(p.plugins.render3d.scene.children).not.toContain(m)
    expect(disposed.has(m)).toBe(true)
    expect(disposed.has(m.geometry)).toBe(true)
    expect(disposed.has(m.material)).toBe(true)
  }
  expect(p.me.packs()).toEqual({})
})
