// The server half of scatter3d on scenes the test writes: a `world.terrain3d` naming a small field the
// test hands the loader, and a `world.scatter3d` carrying the packs. Placement by cell identity, the keep
// rule, the rows by weight, sizes, the treeline, `solids` against the kept instances and how tall they
// stand, and cells that a brush stroke or a new land takes again. `placed` with no ground named throws;
// the mods that place through it are tested beside them (`scatter3d.walker.test.ts`,
// `scatter3d.hitscan3d.test.ts`, `terrain3d.scatter3d.test.ts`).
import { expect, test } from 'vitest'
import { boot, type Scene, type W } from '#engine/engine.ts'
import { loader, written } from '#plugins/loader/loader.sim.ts'
import { edits, heightAt, paintAt, ramp, rules, type Field, type Node, type Stroke } from '#plugins/terrain3d/terrain3d.sim.ts'
import { place, placed, solids, unit, type Ground, type Pack, type Scatter } from './scatter3d.sim.ts'

const ANALYSIS = { slopeStep: 1.5, curveStep: 4, positionRadius: 18, occlusionRadius: 30, occlusionSteps: 5, cliffProbe: 12, cliffSlope: 0.5, cliffDrop: 7, flatAngle: 0.03, records: 50000 }
// Rolling hills some tens of metres high, levelled at spawn.
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
  layers: [{ at: [0, 0], size: 200, px: 100, strokes: [] }],
  ...more,
})

const PACK: Pack = {
  asset: 'firs', rows: { tall: { weight: 2, solid: 0.3 }, small: { weight: 1 }, gone: { weight: 0, solid: 1 } },
  cell: 6, reach: 60, seed: 91, lods: [20, 40], shadow: 30, leaf: 0.5, density: 0.6, rules: [{ q: 'slope', lo: 0.6, hi: 0.3 }],
  clearing: 10, size: [0.8, 0.6], vary: 0.2,
}
const scatterOf = (packs: Record<string, Pack> = { trees: PACK }, more: Partial<Scatter> = {}): Scatter => ({ cutout: 0.45, coverage: 0.25, budget: 1e9, remember: 100000, packs, ...more })

let files = 0
function truthOf(field: Field = fieldOf(), scatter: Scatter = scatterOf()) {
  const url = `/scatter3d-test/${++files}.json`
  written(url, JSON.stringify(field))
  const scene: Scene = {
    world: { terrain3d: { field: 'place' }, scatter3d: scatter, loader: { assets: { place: { type: 'json', url, preload: true } } } },
    prefabs: { loader: {}, probe: {} },
    actors: [{ is: 'loader' }, { is: 'probe' }],
  }
  let w!: W
  const t = boot(scene, { loader, probe: { before(_me, _dt, got) { w = got } } })
  t.step(1 / 60)
  // The ground a game's actor hands scatter3d: terrain3d's server functions over this truth.
  const ground: Ground = {
    height: (x, z) => heightAt(w, x, z), cover: (x, z) => paintAt(w, x, z).cover, ramp: (rule, x, z) => ramp(w, rule, x, z), rules, edits: () => edits(w),
  }
  return { t, w, url, ground, numbers: w.world.scatter3d as Scatter }
}

// Every cell of a pack from (i0, j0) to (i1, j1), in the order given.
const cells = (pack: Pack, ground: Ground, is: number[], js: number[]) => js.flatMap(j => is.map(i => place(pack, i, j, ground)))
const span = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, k) => a + k)
const sorted = (s: { x: number; z: number; radius: number }[]) => [...s].sort((a, b) => a.x - b.x || a.z - b.z)

test('a cell is its own identity: two truths, and any order of asking, place the same instances', () => {
  const a = truthOf(), b = truthOf(fieldOf(), scatterOf())
  const is = span(-12, 12), js = span(-12, 12)
  const forward = cells(PACK, a.ground, is, js)
  const backward = cells(PACK, b.ground, [...is].reverse(), [...js].reverse())
  const flip = backward.slice().reverse()
  expect(flip).toEqual(forward)
  expect(forward.filter(Boolean).length).toBeGreaterThan(50)
  // The server's memo, walked in two orders on two truths, answers the same.
  for (const [x, z] of [[40, -30], [-60, 20], [0, 0]]) solids(a.w, x, z, 25, a.ground)
  for (const [x, z] of [[0, 0], [-60, 20], [40, -30]]) solids(b.w, x, z, 25, b.ground)
  for (const [x, z] of [[40, -30], [-60, 20], [0, 0], [100, 100]]) expect(solids(b.w, x, z, 25, b.ground)).toEqual(solids(a.w, x, z, 25, a.ground))
})

test('the row is picked by running-sum weights, and a row of weight 0 is never drawn', () => {
  const { ground } = truthOf()
  const pack: Pack = { ...PACK, rules: [], density: 1, clearing: 0, rows: { a: { weight: 3 }, none: { weight: 0 }, b: { weight: 1 } } }
  const count: Record<string, number> = {}
  for (const c of cells(pack, ground, span(-40, 40), span(-40, 40))) count[c!.row] = (count[c!.row] ?? 0) + 1
  expect(count.none).toBeUndefined()
  expect(count.a / (count.a + count.b)).toBeCloseTo(0.75, 1)
  // Every row of weight 0 keeps nothing at all.
  expect(cells({ ...pack, rows: { none: { weight: 0 } } }, ground, span(-5, 5), span(-5, 5)).every(c => c === undefined)).toBe(true)
})

test('the clearing keeps every cell whose point is within `clearing` metres of the origin empty', () => {
  const { ground } = truthOf()
  const pack: Pack = { ...PACK, rules: [], density: 1, clearing: 25 }
  const kept = cells(pack, ground, span(-10, 10), span(-10, 10)).filter(Boolean)
  expect(kept.every(c => Math.hypot(c!.x, c!.z) >= 25)).toBe(true)
  expect(cells({ ...pack, clearing: 0 }, ground, span(-10, 10), span(-10, 10)).filter(c => c && Math.hypot(c.x, c.z) < 25).length).toBeGreaterThan(10)
})

test('ground whose cover is 0 keeps nothing', () => {
  const road: Stroke = { verb: 'surface', radius: 40, hardness: 1, strength: 0, level: 0, surface: 'road', path: [[0, 0]] }
  const { ground } = truthOf(fieldOf({ layers: [{ at: [0, 0], size: 200, px: 100, strokes: [road] }] }))
  const pack: Pack = { ...PACK, rules: [], density: 1, clearing: 0 }
  const all = cells(pack, ground, span(-12, 12), span(-12, 12)).filter(Boolean)
  expect(all.filter(c => Math.hypot(c!.x, c!.z) < 38)).toEqual([])
  expect(all.filter(c => Math.hypot(c!.x, c!.z) > 42).length).toBeGreaterThan(100)
})

test('an inverted ramp on height makes a treeline: none above its lo, thinning toward it from below', () => {
  const { ground } = truthOf()
  const pack: Pack = { ...PACK, cell: 4, rules: [{ q: 'height', lo: 50, hi: 30 }], density: 1, clearing: 0 }
  const band: Record<string, { kept: number; all: number }> = {}
  for (const j of span(-60, 60)) for (const i of span(-60, 60)) {
    const c = place(pack, i, j, ground)
    const x = c?.x ?? (i + unit(i, j, pack.seed + 1)) * pack.cell, z = c?.z ?? (j + unit(i, j, pack.seed + 2)) * pack.cell
    const h = ground.height(x, z)
    const b = h < 30 ? 'low' : h < 40 ? 'lower' : h < 50 ? 'upper' : 'high'
    band[b] ??= { kept: 0, all: 0 }
    band[b].all++
    if (c) band[b].kept++
  }
  expect(band.high.all).toBeGreaterThan(100)
  expect(band.high.kept).toBe(0)
  const share = (b: string) => band[b].kept / band[b].all
  expect(share('low')).toBeGreaterThan(0.95)
  expect(share('lower')).toBeGreaterThan(share('upper'))
  expect(share('upper')).toBeGreaterThan(0)
})

test('sizes reach base + spread at any density', () => {
  const { ground } = truthOf()
  for (const density of [0.03, 1]) {
    const pack: Pack = { ...PACK, rules: [], density, clearing: 0 }
    const sizes = cells(pack, ground, span(-90, 90), span(-90, 90)).filter(Boolean).map(c => c!.size)
    expect(sizes.length).toBeGreaterThan(500)
    expect(Math.max(...sizes)).toBeGreaterThan(PACK.size[0] + 0.99 * PACK.size[1])
    expect(Math.min(...sizes)).toBeLessThan(PACK.size[0] + 0.01 * PACK.size[1])
  }
})

test('solids are the kept instances of a solid row whose circle reaches within r, and nothing else', () => {
  const { w, ground } = truthOf()
  const pack: Pack = { ...PACK, rules: [], density: 1, rows: { tall: { weight: 1, solid: 0.5 }, small: { weight: 1 }, gone: { weight: 0, solid: 1 } } }
  const numbers = w.world.scatter3d as Scatter
  numbers.packs = { trees: pack, more: { ...pack, seed: 5, cell: 9, rows: { big: { weight: 1, solid: 2 } } } }
  for (const [x, z, r] of [[30, 20, 12], [-70, 45, 30], [0, 0, 5], [200, -150, 1]]) {
    const want: { x: number; z: number; radius: number }[] = []
    for (const p of Object.values(numbers.packs)) {
      for (const j of span(-60, 60)) for (const i of span(-60, 60)) {
        const c = place(p, i, j, ground)
        const solid = c && p.rows[c.row].solid
        if (c && solid !== undefined && Math.hypot(c.x - x, c.z - z) <= r + solid * c.size) want.push({ x: c.x, z: c.z, radius: solid * c.size })
      }
    }
    const got = solids(w, x, z, r, ground)
    expect(sorted(got)).toEqual(sorted(want))
    if (r >= 12) expect(got.length).toBeGreaterThan(0)
  }
})

test('a solid row\'s tall stands its solids tall·size over the ground, and a solid row with none gives no tall', () => {
  const { w, ground } = truthOf()
  const pack: Pack = { ...PACK, rules: [], density: 1, rows: { rock: { weight: 1, solid: 0.5, tall: 2 }, trunk: { weight: 1, solid: 0.3 } } }
  const numbers = w.world.scatter3d as Scatter
  numbers.packs = { trees: pack }
  const cells = new Map<string, NonNullable<ReturnType<typeof place>>>()
  for (const j of span(-20, 20)) for (const i of span(-20, 20)) {
    const c = place(pack, i, j, ground)
    if (c) cells.set(`${c.x} ${c.z}`, c)
  }
  const got = solids(w, 30, 20, 25, ground)
  const rows = new Set<string>()
  for (const s of got) {
    const c = cells.get(`${s.x} ${s.z}`)!
    rows.add(c.row)
    if (c.row === 'rock') expect(s).toEqual({ x: c.x, z: c.z, radius: 0.5 * c.size, tall: 2 * c.size })
    else expect(s).toEqual({ x: c.x, z: c.z, radius: 0.3 * c.size })
  }
  expect([...rows].sort()).toEqual(['rock', 'trunk'])
})

test('placed throws when the scene names no world.scatter3d.mods.ground', () => {
  const { w } = truthOf()
  expect(() => placed(w)).toThrow('scatter3d is asked where its instances stand, and the scene names no world.scatter3d.mods.ground')
})

test('the packs are read by content: an edit in place is seen on the next question', () => {
  const { w, ground, numbers } = truthOf()
  expect(solids(w, 30, 30, 40, ground).length).toBeGreaterThan(0)
  numbers.packs.trees.density = 0
  expect(solids(w, 30, 30, 40, ground)).toEqual([])
  numbers.packs.trees.density = 0.6
  expect(solids(w, 30, 30, 40, ground).length).toBeGreaterThan(0)
})

test('a pack rule that reads no key of the land record throws naming it', () => {
  const { w, ground, numbers } = truthOf()
  numbers.packs.trees.rules = [{ q: 'slope', lo: 0.6, hi: 0.3 }, { q: 'steepness', lo: 0, hi: 1 }]
  expect(() => solids(w, 0, 0, 10, ground)).toThrow('scatter3d pack trees rule 1 reads steepness')
})

test('the numbers a pack cannot hold throw naming the pack', () => {
  const { w, ground, numbers } = truthOf()
  const bad = (more: Partial<Pack>, message: string) => {
    numbers.packs = { trees: { ...PACK, ...more } }
    expect(() => solids(w, 0, 0, 10, ground)).toThrow(message)
  }
  bad({ lods: [40, 20] }, 'scatter3d pack trees lods 40, 20 do not rise from above 0 to under its reach 60')
  bad({ lods: [20, 60] }, 'scatter3d pack trees lods 20, 60 do not rise from above 0 to under its reach 60')
  bad({ cell: 0 }, 'scatter3d pack trees cell 0 is not above 0')
  bad({ shape: { detail: 1, lumpy: [0.7, 0.3], squash: 0.7 } }, 'scatter3d pack trees has both an asset and a shape')
  bad({ asset: undefined }, 'scatter3d pack trees has neither an asset nor a shape')
  bad({ asset: undefined, shape: { detail: 1, lumpy: [0.7, 0.3], squash: 0.7 } }, 'scatter3d pack trees has a shape and no colour')
  bad({ rows: { tall: { weight: -1 } } }, 'scatter3d pack trees row tall weighs -1')
  bad({ rows: { tall: { weight: 1, solid: 0.3, tall: 0 } } }, 'scatter3d pack trees row tall stands 0 tall')
  bad({ rows: { tall: { weight: 1, solid: 0.3, tall: -2 } } }, 'scatter3d pack trees row tall stands -2 tall')
  numbers.packs = { trees: PACK }
  numbers.remember = 0
  expect(() => solids(w, 0, 0, 10, ground)).toThrow('scatter3d remember 0 is not a whole number above 0')
})

test('a stroke drops the remembered cells whose square meets its layer\'s rect, and a new land drops every one', () => {
  const { t, w, ground, url, numbers } = truthOf(fieldOf({ layers: [{ at: [60, 60], size: 40, px: 40, strokes: [] }] }))
  numbers.packs.trees.rules = []
  numbers.packs.trees.density = 1
  const inRoad = () => solids(w, 60, 60, 12, ground)
  const far = () => solids(w, -80, -80, 30, ground)
  expect(inRoad().length).toBeGreaterThan(0)
  const before = far()
  // The brush's stroke bakes into the truth's land: a road over the layer.
  edits(w).land.stroke(0, { verb: 'surface', radius: 30, hardness: 1, strength: 0, level: 0, surface: 'road', path: [[60, 60]] })
  expect(inRoad()).toEqual([])
  expect(far()).toEqual(before)
  // A new file makes a new land, without the stroke: every cell is taken again.
  written(url, JSON.stringify(fieldOf({ layers: [{ at: [60, 60], size: 40, px: 40, strokes: [] }], grain: { base: 0.9, range: 0 } })))
  t.step(1 / 60)
  expect(inRoad().length).toBeGreaterThan(0)
})

test('the server keeps at most `remember` cells: the ones asked for longest ago are placed again, and with room they are not', () => {
  for (const [remember, again] of [[10, true], [100000, false]] as const) {
    const { w, ground } = truthOf(fieldOf(), scatterOf({ trees: { ...PACK, rules: [], clearing: 0 } }, { remember }))
    let covers = 0
    const counted: Ground = { ...ground, cover: (x, z) => { covers++; return ground.cover(x, z) } }
    solids(w, 0, 0, 5, counted)
    for (let k = 0; k < 30; k++) solids(w, 100 + k * 30, 50, 5, counted)
    covers = 0
    solids(w, 0, 0, 5, counted)
    expect(covers > 0).toBe(again)
  }
})

test('with room for few cells the answers are the same, the ones asked for longest ago made again', () => {
  const big = truthOf(), small = truthOf(fieldOf(), scatterOf({ trees: PACK }, { remember: 10 }))
  for (let n = 0; n < 30; n++) {
    const x = Math.sin(n * 12.9898) * 200, z = Math.cos(n * 78.233) * 200
    expect(solids(small.w, x, z, 20, small.ground)).toEqual(solids(big.w, x, z, 20, big.ground))
  }
})
