// The browser half on render3d with no canvas, and a loader that hands over a field the test writes:
// hills with a road layer at the spawn, drawn as three rings round the camera. Each test walks what
// a page does with the land: draws it round the camera, meets ring to ring without a crack, follows
// the camera within its budget, stands still when static, draws the sea or its bed, preloads, jumps
// to a place prepared ahead, takes a rewritten field and a brush stroke, aims at the ground, and
// closes. The clock moves a millisecond each time it is read, so `budget` slices a rebuild as it
// does on a page.
import { afterAll, afterEach, beforeEach, expect, test, vi } from 'vitest'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import type * as THREE from 'three'
import { prepare } from '#addons/scenemanager/scenemanager.addon.ts'
import { render3d } from '#plugins/render3d/render3d.plugin.ts'
import { land, type Field, type Program, type Stroke } from './terrain3d.sim.ts'
import { terrain3d } from './terrain3d.plugin.ts'

let clock = 0
beforeEach(() => { vi.spyOn(performance, 'now').mockImplementation(() => clock++) })
afterEach(() => { vi.restoreAllMocks() })

const fieldOf = (program: Partial<Program> = {}): Field => ({
  program: {
    world: 600, hscale: 80, sea: 0.5, flood: false, out: 'hills',
    nodes: [{ id: 'hills', op: 'noise', kind: 'simplex', freq: 9, seed: 2754 }],
    ...program,
  },
  analysis: { slopeStep: 1.5, curveStep: 4, positionRadius: 18, occlusionRadius: 30, occlusionSteps: 5, cliffProbe: 12, cliffSlope: 0.5, cliffDrop: 7, flatAngle: 0.03, records: 50000 },
  ground: { layers: [{ name: 'grass', map: 'grass', normal: 'grassNormal', scale: 30 }, { name: 'rock', map: 'rock', scale: 30, where: [{ q: 'slope', lo: 0.3, hi: 0.45 }] }] },
  surfaces: { road: { colour: '#6d6459', cover: 0 } },
  layers: [{ at: [0, 0], size: 32, px: 32, strokes: [] }],
})
// Cells of 4, 8 and 32 m: two seams, one of two fine cells to a coarse one and one of four.
const RINGS = [{ reach: 40, seg: 20 }, { reach: 100, seg: 25 }, { reach: 400, seg: 25 }]
const CATALOGUE: Record<string, { type: string }> = { grass: { type: 'texture' }, grassNormal: { type: 'texture' }, rock: { type: 'texture' } }

type Options = { field?: Field; budget?: number; seabed?: boolean; static?: boolean; preload?: boolean }
function page(o: Options = {}) {
  const files: Record<string, Field> = { place: o.field ?? fieldOf() }
  const plugins: any = {
    wire: {
      rows: [],
      scene: {
        world: { terrain3d: { field: 'place', rings: RINGS, shadowReach: 100, budget: o.budget ?? 1e9, seabed: o.seabed ?? false, static: o.static, preload: o.preload } },
        prefabs: { engine: { width: 320, height: 200 }, render3d: { camera: { fov: 60, near: 0.15, far: 3000, at: [0, 60, 0], look: [10, 50, 10] } } },
      },
    },
    render3d: render3d(),
    loader: { get: (name: string) => files[name], catalogued: (name: string) => CATALOGUE[name], load: () => undefined },
  }
  const me = terrain3d()
  const frame = () => {
    plugins.render3d.tick(plugins)
    me.afterTick(plugins)
  }
  // Frames until no rebuild is in hand; how many it took.
  const settle = () => {
    let n = 1
    frame()
    for (; n < 2000 && me.building(); n++) frame()
    expect(me.building()).toBeUndefined()
    return n
  }
  const move = (x: number, z: number) => {
    plugins.render3d.tick(plugins)
    plugins.render3d.camera.position.set(x, 60, z)
  }
  return { plugins, me, frame, settle, move, files }
}

const P = (m: THREE.Mesh) => m.geometry.getAttribute('position') as THREE.BufferAttribute
// Ring k's vertices strictly inside its square: none on its edge, a seam or the skirt.
function inside(me: ReturnType<typeof page>['me'], k: number) {
  const r = me.rings[k], p = P(r.mesh), hole = k > 0 ? me.rings[k - 1] : undefined
  const out: number[][] = []
  for (let v = 0; v < p.count; v++) {
    const x = p.getX(v), y = p.getY(v), z = p.getZ(v)
    if (Math.abs(x - r.at[0]) >= r.half || Math.abs(z - r.at[1]) >= r.half) continue
    if (hole && Math.abs(x - hole.at[0]) <= hole.half && Math.abs(z - hole.at[1]) <= hole.half) continue
    out.push([x, y, z])
  }
  return out
}

test('once the field has loaded, three rings stand round the camera on render3d\'s scene, at the land\'s heights, and the ground other plugins ask is that land', () => {
  const { me, settle, plugins, files } = page()
  expect(me.ground).toBeUndefined()
  settle()
  expect(me.rings).toHaveLength(3)
  const scene = plugins.render3d.scene as THREE.Scene
  for (const r of me.rings) {
    expect(scene.children).toContain(r.mesh)
    expect(Math.abs(r.at[0])).toBeLessThan(r.half)
    expect(Math.abs(r.at[1])).toBeLessThan(r.half)
  }
  const truth = land(structuredClone(files.place))
  for (let k = 0; k < 3; k++) {
    const vs = inside(me, k)
    expect(vs.length).toBeGreaterThan(100)
    for (const [x, y, z] of vs) expect(y).toBe(Math.fround(truth.height(x, z)))
  }
  for (const [x, z] of [[0, 0], [33, -71], [-250, 180]]) expect(me.ground!.height(x, z)).toBe(truth.height(x, z))
  expect(me.shown()).toBe(true)
})

test('ring meets ring without a crack: every vertex on a finer ring\'s edge is a vertex of the coarser ring, at 30 places the camera goes', () => {
  const { me, settle, move } = page()
  for (let n = 0; n < 30; n++) {
    move(Math.sin(n * 12.9898) * 300, Math.cos(n * 78.233) * 300)
    settle()
    for (let k = 1; k < me.rings.length; k++) {
      const fine = me.rings[k - 1], coarse = P(me.rings[k].mesh), p = P(fine.mesh)
      const at = new Set<string>()
      for (let v = 0; v < coarse.count; v++) at.add(`${coarse.getX(v)},${coarse.getY(v)},${coarse.getZ(v)}`)
      let edge = 0
      for (let v = 0; v < p.count; v++) {
        const x = p.getX(v), z = p.getZ(v)
        if (Math.abs(x - fine.at[0]) !== fine.half && Math.abs(z - fine.at[1]) !== fine.half) continue
        edge++
        expect(at.has(`${x},${p.getY(v)},${z}`)).toBe(true)
      }
      expect(edge).toBe(8 * fine.half / fine.cell)
    }
  }
})

test('the rings follow the camera across the land a slice a frame, and the ground is on the scene every frame they rebuild', () => {
  const { me, settle, move, frame, plugins } = page({ budget: 20 })
  settle()
  const scene = plugins.render3d.scene as THREE.Scene
  move(260, -310)
  frame()
  let frames = 1
  for (; me.building() && frames < 2000; frames++) {
    expect(me.rings).toHaveLength(3)
    for (const r of me.rings) expect(scene.children).toContain(r.mesh)
    frame()
  }
  expect(me.building()).toBeUndefined()
  expect(frames).toBeGreaterThan(5)
  for (const r of me.rings) {
    expect(Math.abs(r.at[0] - 260)).toBeLessThan(r.half)
    expect(Math.abs(r.at[1] + 310)).toBeLessThan(r.half)
  }
})

test('static rings stand round the origin wherever the camera goes', () => {
  const { me, settle, move } = page({ static: true })
  settle()
  move(300, 280)
  settle()
  for (const r of me.rings) expect(r.at).toEqual([0, 0])
})

test('over a flooded field the rings draw the water\'s surface, or with seabed the bed under it', () => {
  const field = fieldOf({ sea: 0.65, flood: true })
  const truth = land(structuredClone(field))
  const sea = page({ field }), bed = page({ field: structuredClone(field), seabed: true })
  sea.settle()
  bed.settle()
  let under = 0
  for (const [x, y, z] of inside(sea.me, 0)) {
    if (truth.raw(x, z) >= 0) continue
    under++
    expect(y).toBe(0)
  }
  for (const [x, y, z] of inside(bed.me, 0)) if (truth.raw(x, z) < 0) expect(y).toBe(Math.fround(truth.raw(x, z)))
  expect(under).toBeGreaterThan(20)
})

// A game's own plugin, `gate`, whose share of a prepared place is done once the test says so, as
// scatter3d's is once its cells are placed: its mod for terrain3d, in a game folder of the test's own.
const home = mkdtempSync(join(tmpdir(), 'terrain3d-plugin-'))
mkdirSync(join(home, 'plugins', 'gate'), { recursive: true })
writeFileSync(join(home, 'plugins', 'gate', 'gate.terrain3d.ts'), 'export const ready = () => globalThis.terrain3dGate === true\n')
afterAll(() => rmSync(home, { recursive: true }))
const gate = (open: boolean) => { (globalThis as { terrain3dGate?: boolean }).terrain3dGate = open }

test('a preloading scene puts nothing of the land on the scene until the camera\'s place is whole and every plugin standing on it is done, then all of it at once', async () => {
  const { me, frame, plugins } = page({ preload: true, budget: 20 })
  const { scene: on } = plugins.wire
  on.plugins = ['loader', 'shipped', 'terrain3d', 'render3d']
  Object.assign(on.world, { shipped: { plugins: ['gate'] }, scenemanager: { home: pathToFileURL(home + '/').href } })
  on.world.terrain3d.mods = { ready: 'gate' }
  await prepare({}, [], on.world)
  gate(false)
  const scene = plugins.render3d.scene as THREE.Scene
  for (let n = 0; n < 30; n++) {
    frame()
    expect(scene.children.filter(c => (c as THREE.Mesh).isMesh)).toHaveLength(0)
    expect(me.ground!.shown()).toBe(false)
  }
  // The rings are built, and wait off the scene.
  expect(me.rings).toHaveLength(3)
  gate(true)
  frame()
  expect(me.ground!.shown()).toBe(true)
  for (const r of me.rings) expect(scene.children).toContain(r.mesh)
})

test('a place prepared ahead of a jump is built off the scene, and the camera arriving there swaps it in that frame; a jump nobody prepared takes many', () => {
  const ahead = page({ budget: 20 })
  ahead.settle()
  const there = [350, 290]
  ahead.me.ground!.prepare(there[0], there[1])
  for (let n = 0; n < 2000 && !ahead.me.prepared()!.done; n++) ahead.frame()
  expect(ahead.me.prepared()!.done).toBe(true)
  // Still drawn round the origin while the place waits.
  expect(ahead.me.rings[0].at).toEqual([0, 0])
  ahead.move(there[0], there[1])
  ahead.frame()
  expect(ahead.me.building()).toBeUndefined()
  expect(Math.abs(ahead.me.rings[0].at[0] - there[0])).toBeLessThan(ahead.me.rings[0].half)
  expect(Math.abs(ahead.me.rings[0].at[1] - there[1])).toBeLessThan(ahead.me.rings[0].half)
  expect(ahead.me.prepared()).toBeUndefined()
  const cold = page({ budget: 20 })
  cold.settle()
  cold.move(there[0], there[1])
  expect(cold.settle()).toBeGreaterThan(5)
})

test('a field rewritten with new heights is drawn at them', () => {
  const { me, settle, files } = page()
  settle()
  // The loader refills a rewritten file in place.
  Object.assign(files.place, fieldOf({ hscale: 160 }))
  settle()
  const truth = land(structuredClone(files.place))
  for (const [x, y, z] of inside(me, 0)) expect(y).toBe(Math.fround(truth.height(x, z)))
})

test('a brush stroke into the page\'s land redraws the ground it raised, and only that', () => {
  const { me, settle } = page()
  settle()
  const before = new Map(inside(me, 0).map(([x, y, z]) => [`${x},${z}`, y]))
  const raise: Stroke = { verb: 'raise', radius: 8, hardness: 1, strength: 5, level: 0, surface: '', path: [[0, 0]] }
  me.land!.stroke(0, raise)
  settle()
  const after = inside(me, 0)
  for (const [x, y, z] of after) expect(y).toBe(Math.fround(me.land!.height(x, z)))
  const at = (x: number, z: number) => after.find(v => v[0] === x && v[2] === z)![1]
  expect(at(0, 0) - before.get('0,0')!).toBeGreaterThan(4.9)
  expect(at(36, 36)).toBe(before.get('36,36'))
})

test('a ray from the camera meets the ground the rings draw', () => {
  const { me, settle } = page()
  settle()
  for (const dir of [[0.3, -1, 0.2], [-0.5, -0.4, 0.9], [0, -1, 0]]) {
    const hit = me.ground!.ray([0, 60, 0], dir)!
    expect(hit[1]).toBeCloseTo(me.ground!.height(hit[0], hit[2]), 4)
  }
  expect(me.ground!.ray([0, 60, 0], [0, 1, 0])).toBeUndefined()
})

test('close takes the rings off the scene', () => {
  const { me, settle, plugins } = page()
  settle()
  const meshes = me.rings.map(r => r.mesh)
  me.close()
  const scene = plugins.render3d.scene as THREE.Scene
  for (const m of meshes) expect(scene.children).not.toContain(m)
  expect(me.rings).toEqual([])
})
