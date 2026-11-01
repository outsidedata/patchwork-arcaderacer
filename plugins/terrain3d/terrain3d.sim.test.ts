// The ground as a game's rules ask it, through `w` of a scene whose `world.terrain3d` names a field
// in the loader's catalogue: hills cleared flat at the spawn, with rock drawn on their steep sides.
// Each test walks one thing a game does with the land: stands on it, floods it, cuts a road across
// it, blends biomes, reads which layer is drawn, shoots at it, rewrites it, strokes it with the
// brush, and writes its program from every op.
import { expect, test } from 'vitest'
import { boot, type Scene, type W } from '#engine/engine.ts'
import { loader, written } from '#plugins/loader/loader.sim.ts'
import {
  analyse, depthAt, edits, heightAt, land, normalAt, occludes, paintAt, ramp, rawAt, ray, restsAt,
  type Field, type Node, type Program, type Stroke,
} from './terrain3d.sim.ts'

const ANALYSIS = { slopeStep: 1.5, curveStep: 4, positionRadius: 18, occlusionRadius: 30, occlusionSteps: 5, cliffProbe: 12, cliffSlope: 0.5, cliffDrop: 7, flatAngle: 0.03, records: 50000 }
// Hills, levelled flat round the spawn.
const HILLS: Node[] = [
  { id: 'hills', op: 'noise', kind: 'simplex', freq: 8, seed: 21 },
  { id: 'spawn', op: 'clearing', input: 'hills', flat: 30, floor: 0 },
]
const fieldOf = (more: Partial<Field> = {}, program: Partial<Program> = {}): Field => ({
  program: { world: 600, hscale: 120, sea: 0.5, flood: false, out: 'spawn', nodes: HILLS, ...program },
  analysis: ANALYSIS,
  ground: { layers: [{ name: 'grass', map: 'grass', scale: 30 }, { name: 'rock', map: 'rock', scale: 30, where: [{ q: 'slope', lo: 0.3, hi: 0.45 }] }] },
  surfaces: { road: { colour: '#6d6459', cover: 0, grip: 0.6, drag: 0.02, spray: 'grit', mark: 0 } },
  layers: [],
  ...more,
})

let files = 0
// A truth of a scene whose `world.terrain3d` names a json file holding `field`, and its `w`.
function truthOf(field: Field) {
  const url = `/terrain3d-sim-test/${++files}.json`
  written(url, JSON.stringify(field))
  const scene: Scene = {
    world: { terrain3d: { field: 'place' }, loader: { assets: { place: { type: 'json', url, preload: true } } } },
    prefabs: { loader: {}, probe: {} },
    actors: [{ is: 'loader' }, { is: 'probe' }],
  }
  let w!: W
  const t = boot(scene, { loader, probe: { before(_me, _dt, got) { w = got } } })
  t.step(1 / 60)
  return { t, w, url }
}

// A point every 5 m over a square 400 m across.
const GRID = Array.from({ length: 81 * 81 }, (_, k) => [(k % 81) * 5 - 200, Math.floor(k / 81) * 5 - 200])

test('a rule reads the ground of the field its scene names, and every truth and the page\'s own land read the same bytes', () => {
  const field = fieldOf()
  const a = truthOf(field), b = truthOf(structuredClone(field))
  const page = land(structuredClone(field))
  const bytes = (h: (x: number, z: number) => number) => new Uint8Array(Float64Array.from(GRID, ([x, z]) => h(x, z)).buffer)
  const ha = bytes((x, z) => heightAt(a.w, x, z))
  expect(bytes((x, z) => heightAt(b.w, x, z))).toEqual(ha)
  expect(bytes(page.height)).toEqual(ha)
  // No sea: the ground is the land itself, and holds no water.
  expect(bytes((x, z) => rawAt(a.w, x, z))).toEqual(ha)
  expect(GRID.every(([x, z]) => depthAt(a.w, x, z) === 0)).toBe(true)
})

test('a spawn cleared in the program stands on level ground amid the hills', () => {
  const { w } = truthOf(fieldOf())
  expect(analyse(w, 0, 0).slope).toBeLessThan(0.001)
  expect(normalAt(w, 0, 0, 1)[1]).toBeGreaterThan(0.999)
  // A body wider than a step rests where it stands.
  expect(restsAt(w, 0, 0, 2)).toBeCloseTo(heightAt(w, 0, 0), 3)
  // Out on the hills the ground climbs steeply.
  expect(Math.max(...GRID.map(([x, z]) => analyse(w, x, z).slope))).toBeGreaterThan(0.5)
})

test('a flooded field holds a sea over its low ground: the water\'s surface is at 0, the bed under it is rawAt, depthAt is how deep; unflooded, the same valley is dry', () => {
  const sea = truthOf(fieldOf({}, { sea: 0.6, flood: true })).w
  const dry = truthOf(fieldOf({}, { sea: 0.6, flood: false })).w
  const wet = GRID.filter(([x, z]) => rawAt(sea, x, z) < -1)
  const land = GRID.filter(([x, z]) => rawAt(sea, x, z) > 1)
  expect(wet.length).toBeGreaterThan(100)
  expect(land.length).toBeGreaterThan(100)
  for (const [x, z] of wet) {
    expect(heightAt(sea, x, z)).toBe(0)
    expect(depthAt(sea, x, z)).toBe(-rawAt(sea, x, z))
    expect(heightAt(dry, x, z)).toBe(rawAt(sea, x, z))
    expect(depthAt(dry, x, z)).toBe(0)
  }
  for (const [x, z] of land) {
    expect(heightAt(sea, x, z)).toBe(rawAt(sea, x, z))
    expect(depthAt(sea, x, z)).toBe(0)
  }
})

// A road cut across the hills as the brush paints one: a bench along its path, then road over it.
const PATH = [[-90, 40], [-20, 60], [90, 30]]
const BENCH: Stroke = { verb: 'bench', radius: 8, hardness: 0.6, strength: 0, level: 0, surface: '', path: PATH }
const ROAD: Stroke = { verb: 'surface', radius: 5, hardness: 0.8, strength: 0, level: 0, surface: 'road', path: PATH }
const roadField = () => fieldOf({ layers: [{ at: [0, 40], size: 220, px: 220, strokes: [BENCH, ROAD] }] })

test('a road painted in the field is cut level across the hillside, and says it is road to the wheels and the scatter on it', () => {
  const { w } = truthOf(roadField())
  const hills = truthOf(fieldOf()).w
  // Across the road, 3 m either side of its middle, square to it, at points along it where the hill
  // fell away across it.
  let steep = 0
  for (let s = 0; s < PATH.length - 1; s++) {
    const [ax, az] = PATH[s], [bx, bz] = PATH[s + 1], len = Math.hypot(bx - ax, bz - az)
    const nx = -(bz - az) / len, nz = (bx - ax) / len
    for (const t of [0.25, 0.5, 0.75]) {
      const x = ax + (bx - ax) * t, z = az + (bz - az) * t
      const across = (g: W) => Math.abs(heightAt(g, x + 3 * nx, z + 3 * nz) - heightAt(g, x - 3 * nx, z - 3 * nz))
      if (across(hills) > 1) steep++
      expect(across(w)).toBeLessThan(0.05 * across(hills) + 0.02)
    }
  }
  expect(steep).toBeGreaterThanOrEqual(2)
  // On the road: its surface, all of it, as a wheel and a scatter rule read it.
  for (const [x, z] of [[-90, 40], [-20, 60], [35, 45]]) {
    const on = paintAt(w, x, z)
    expect(on.surface).toBe('road')
    expect(on.weight).toBeGreaterThan(0.99)
    expect(on).toMatchObject({ spray: 'grit', mark: 0 })
    expect(on.cover).toBeCloseTo(0, 2)
    expect(on.grip).toBeCloseTo(0.6, 2)
    expect(on.drag).toBeCloseTo(0.02, 4)
    expect(ramp(w, { q: 'surface:road', lo: 0.5, hi: 1 }, x, z)).toBe(1)
  }
  // Off it: unpainted ground.
  expect(paintAt(w, 0, -60)).toEqual({ weight: 0, surface: undefined, cover: 1, grip: 1, drag: 0, spray: undefined, mark: undefined })
  expect(ramp(w, { q: 'surface:road', lo: 0.5, hi: 1 }, 0, -60)).toBe(0)
})

test('a program of two biomes blends their grounds by each one\'s share there, and the land record reads the shares', () => {
  const nodes: Node[] = [
    { id: 'n', op: 'noise', kind: 'value', freq: 3, seed: 4 },
    { id: 'away', op: 'remap', input: 'n', inLo: 0, inHi: 1, outLo: 1, outHi: 0 },
    { id: 'plain', op: 'const', value: 0.3 },
    { id: 'ridges', op: 'noise', kind: 'simplex', freq: 14, seed: 9 },
    { id: 'peaks', op: 'fold', input: 'ridges', kind: 'ridge' },
    { id: 'mix', op: 'biomes', list: [{ name: 'meadow', strength: 'n', height: 'plain' }, { name: 'alps', strength: 'away', height: 'peaks' }], sharp: 6 },
  ]
  const { w } = truthOf(fieldOf({}, { nodes, out: 'mix', hscale: 100 }))
  const l = edits(w).land
  let meadow = 0, alps = 0
  for (const [x, z] of GRID) {
    const share = l.mix(x, z)
    expect(share.meadow + share.alps).toBeCloseTo(1, 12)
    expect(analyse(w, x, z).read('biome:alps')).toBe(share.alps)
    // Deep in the meadow the ground is the meadow's own, flat at 0.3·hscale.
    if (share.meadow > 0.999) { meadow++; expect(heightAt(w, x, z)).toBeCloseTo(30, 0) }
    if (share.alps > 0.999) alps++
  }
  expect(meadow).toBeGreaterThan(50)
  expect(alps).toBeGreaterThan(50)
})

test('the ground says which layer is drawn where: grass on the flat, rock on the steep, and a scatter rule reads layer:rock', () => {
  const { w } = truthOf(fieldOf())
  const l = edits(w).land
  for (const [x, z] of GRID.filter((_, k) => k % 7 === 0)) {
    const drawn = l.layers(x, z)
    expect(drawn.grass + drawn.rock).toBeCloseTo(1, 12)
    expect(analyse(w, x, z).read('layer:rock')).toBe(drawn.rock)
  }
  expect(l.layers(0, 0)).toEqual({ grass: 1, rock: 0 })
  const cliff = GRID.find(([x, z]) => analyse(w, x, z).slope > 0.5)!
  expect(l.layers(cliff[0], cliff[1])).toEqual({ grass: 0, rock: 1 })
  expect(ramp(w, { q: 'layer:rock', lo: 0.5, hi: 0.85 }, cliff[0], cliff[1])).toBe(1)
  expect(ramp(w, { q: 'layer:rock', lo: 0.5, hi: 0.85 }, 0, 0)).toBe(0)
})

test('a shot meets the ground where it stands, and a hill between two points hides one from the other', () => {
  const { w } = truthOf(fieldOf())
  for (const [x, z] of [[0, 0], [-120, 75], [90, -140]]) {
    const hit = ray(w, [x, 500, z], [0, -1, 0], 1000)!
    expect(hit[1]).toBeCloseTo(heightAt(w, x, z), 5)
    // Aimed slantwise at the same point, from 300 m off, it meets the ground first on its way there.
    const from = [x - 300, heightAt(w, x, z) + 200, z]
    const slant = ray(w, from, [300, -200, 0], 1000)!
    expect(Math.abs(slant[1] - heightAt(w, slant[0], slant[2]))).toBeLessThan(1e-4)
  }
  expect(ray(w, [0, 500, 0], [0, 1, 0], 1000)).toBeUndefined()
  // The highest point on the line z = 100, and two points 2 m over the ground 150 m either side.
  const line = Array.from({ length: 301 }, (_, i) => i - 150)
  const top = line.reduce((a, x) => (heightAt(w, x, 100) > heightAt(w, a, 100) ? x : a))
  const a = [top - 150, heightAt(w, top - 150, 100) + 2, 100], b = [top + 150, heightAt(w, top + 150, 100) + 2, 100]
  expect(heightAt(w, top, 100)).toBeGreaterThan(Math.max(a[1], b[1]) + 5)
  expect(occludes(w, a, b)).toBe(true)
  expect(occludes(w, [a[0], 500, a[2]], [b[0], 500, b[2]])).toBe(false)
})

test('a field rewritten with new content is the ground from the next question on, and one rewritten the same is the land it was', () => {
  const field = fieldOf()
  const { t, w, url } = truthOf(field)
  const first = edits(w).land
  const h = heightAt(w, 40, -60)
  written(url, JSON.stringify(field))
  t.step(1 / 60)
  expect(edits(w).land).toBe(first)
  written(url, JSON.stringify(fieldOf({}, { hscale: 60 })))
  expect(edits(w).land).not.toBe(first)
  expect(heightAt(w, 40, -60)).toBeCloseTo(h / 2, 9)
})

test('the brush: a stroke raises the ground under it and says where, discarding it puts the ground back, and a land made from the saved file holds it', () => {
  const field = fieldOf({ layers: [{ at: [50, 50], size: 64, px: 64, strokes: [] }] })
  const l = land(field)
  // A pixel's middle, where the paint is the pixel's own and not blended with its neighbours'.
  const before = l.height(50.5, 50.5), far = l.height(-100, -100)
  const raise: Stroke = { verb: 'raise', radius: 10, hardness: 0.5, strength: 4, level: 0, surface: '', path: [[50, 50]] }
  l.stroke(0, raise)
  expect(l.height(50.5, 50.5)).toBeCloseTo(before + 4, 9)
  expect(l.height(-100, -100)).toBe(far)
  // What a consumer compares: the layer's version moved, and its rect holds the stroke.
  const e = l.edits()
  expect(e.layers[0].version).toBe(1)
  const [x0, z0, x1, z1] = e.layers[0].rect
  expect(x0 < 40 && z0 < 40 && x1 > 60 && z1 > 60).toBe(true)
  l.discard(0)
  expect(l.height(50.5, 50.5)).toBe(before)
  expect(l.edits().layers[0].version).toBe(2)
  // Stroked again and saved: the land of the file that holds it is the ground the stroke made.
  l.stroke(0, raise)
  const saved = land({ ...field, layers: [{ ...field.layers[0], strokes: [raise] }] }, l)
  expect(saved.unsaved(0)).toBeUndefined()
  expect(saved.height(50.5, 50.5)).toBe(l.height(50.5, 50.5))
})

test('a moon of craters has bowls sunk below its plain, with rims raised round them', () => {
  const nodes: Node[] = [{ id: 'moon', op: 'craters', freq: 6, seed: 3, radius: [15, 40], depth: 0.2, rim: 0.05, rimWidth: 0.15, ejecta: 2 }]
  const { w } = truthOf(fieldOf({}, { nodes, out: 'moon', hscale: 100 }))
  const h = GRID.map(([x, z]) => heightAt(w, x, z))
  expect(Math.min(...h)).toBeLessThan(-10)
  expect(Math.max(...h)).toBeGreaterThan(2)
})

test('a program written from every op is one ground, the same in every land made from it', () => {
  const nodes: Node[] = [
    { id: 'v', op: 'noise', kind: 'value', freq: 5, seed: 1 },
    { id: 's', op: 'noise', kind: 'simplex', freq: 7, seed: 2, rotate: 0.4, stretch: [1, 2] },
    { id: 'c', op: 'noise', kind: 'worley', freq: 9, seed: 3, metric: 'f2-f1' },
    { id: 'wx', op: 'noise', kind: 'value', freq: 4, seed: 5 },
    { id: 'wz', op: 'noise', kind: 'value', freq: 4, seed: 6 },
    { id: 'warped', op: 'warp', input: 's', x: 'wx', z: 'wz', amount: 30 },
    { id: 'ridge', op: 'fold', input: 'warped', kind: 'ridge' },
    { id: 'steps', op: 'fold', input: 'v', kind: 'terrace', steps: 5 },
    { id: 'eased', op: 'remap', input: 'c', inLo: 0, inHi: 0.6, outLo: 0, outHi: 0.4, ease: 'smoother' },
    { id: 'hilly', op: 'combine', a: 'ridge', b: 'steps', mode: 'lerp', t: 0.4 },
    { id: 'pitted', op: 'combine', a: 'hilly', b: 'eased', mode: 'sub' },
    { id: 'small', op: 'scale', input: 'pitted', by: 0.8 },
    { id: 'pocked', op: 'craters', freq: 4, seed: 7, radius: [10, 25], depth: 0.1, rim: 0.03, rimWidth: 0.2, ejecta: 1.8 },
    { id: 'moon', op: 'combine', a: 'small', b: 'pocked', mode: 'add' },
    { id: 'spawn', op: 'clearing', input: 'moon', flat: 20, floor: 0.1 },
  ]
  const field = fieldOf({}, { nodes, out: 'spawn' })
  const a = land(structuredClone(field)), b = land(structuredClone(field))
  const h = GRID.map(([x, z]) => a.height(x, z))
  expect(h.every(Number.isFinite)).toBe(true)
  expect(GRID.map(([x, z]) => b.height(x, z))).toEqual(h)
  expect(Math.max(...h) - Math.min(...h)).toBeGreaterThan(20)
})
