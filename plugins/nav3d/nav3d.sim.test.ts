// nav3d's server half. The test writes a manager and one child, `yard`, which `load` boots as a game's
// would: level ground (terrain3d's), a wall (a shapes3d box 6 m across and 0.4 m long, its long sides
// along x) and a `lever` row, and graphs, each of shapes3d's points and lines:
//   field   baked from the space: the wall grown by a 0.5 m clearance, terrain3d's ground under it.
//   hand    written by hand, as a level's generator writes one, with no blocks: a yard, a kitchen across a
//           gate from it and round by a far corner, a loft reached by a one-way way out of it alone, and
//           an island no way reaches. The game's own plugin `gate` delivers the word `gate`, open while
//           the lever is, and for the staff alone when its data says so.
//   levels  written by hand with no blocks: a hall's floor, and a roof 4 m over it reached by a stair
//           from the roof's far side, a way with a cost of its own.
//   short, long  a foot and a top, joined by a `ladder`, a word nothing delivers, and round by two ways
//           of 5 m of ground: the ladder costs 3 in short and 30 in long. broken: a place with no height.
//   curved  the levels, the stair a spline round from the hall up to the roof, carrying a clip for crowd3d;
//           askew the same, its spline starting off the hall's place.
// Its `probe` hands the test the child's `w`.
import { afterAll, expect, test } from 'vitest'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { boot, type Scene, type W } from '#engine/engine.ts'
import { load } from '#addons/scenemanager/scenemanager.addon.ts'
import { scenemanager } from '#plugins/scenemanager/scenemanager.sim.ts'
import { written } from '#plugins/loader/loader.sim.ts'
import type { Field } from '#plugins/terrain3d/terrain3d.sim.ts'
import { drawn } from '#plugins/shapes3d/shapes3d.kinematics3d.ts'
import { graphOf, grow, pointsOf, route, wordOf, type Data, type Graph, type Place, type Way } from './nav3d.sim.ts'
import { route as npcRoute } from './nav3d.npc3d.ts'

const DT = 1 / 60
const field: Field = {
  program: { world: 600, hscale: 1, sea: 0.5, flood: false, out: 'level', nodes: [{ id: 'level', op: 'const', value: 0 }] },
  analysis: { slopeStep: 1.5, curveStep: 4, positionRadius: 18, occlusionRadius: 30, occlusionSteps: 5, cliffProbe: 12, cliffSlope: 0.5, cliffDrop: 7, flatAngle: 0.03, records: 50000 },
  ground: { layers: [{ name: 'grass', map: 'grass', scale: 30 }] },
  surfaces: {},
  layers: [],
}
const place = (at: number[], tags?: string[], normal?: number[]): Place => ({
  point: normal ? { at, normal } : { at },
  ...(tags ? { data: { nav3d: { tags } } } : {}),
})
const flat = (x: number, z: number, tags?: string[]) => place([x, 0, z], tags)
const line = (from: number[], to: number[], data: Data): Way => ({ line: { from, to }, data })
const g0 = (x: number, z: number) => [x, 0, z]
const hand: Graph = {
  places: [flat(0, 0, ['yard']), flat(10, 0), flat(10, 10, ['kitchen']), flat(0, 10), flat(20, 0, ['loft']), flat(50, 50, ['island'])],
  ways: [
    line(g0(0, 0), g0(10, 0), { nav3d: { word: 'ground' } }),
    line(g0(10, 0), g0(10, 10), { nav3d: { word: 'ground' } }),
    line(g0(0, 0), g0(0, 10), { nav3d: { word: 'gate' }, gate: {} }),
    line(g0(0, 10), g0(10, 10), { nav3d: { word: 'ground' } }),
    line(g0(20, 0), g0(10, 0), { nav3d: { word: 'ground', one: true } }),
  ],
}
const staff: Graph = { ...hand, ways: hand.ways.map((wy, i) => (i === 2 ? line(g0(0, 0), g0(0, 10), { nav3d: { word: 'gate' }, gate: { staff: true } }) : wy)) }
const levels: Graph = {
  places: [place([0, 0, 0], ['hall']), place([0, 4, 3], ['roof'])],
  ways: [line([0, 0, 0], [0, 4, 3], { nav3d: { word: 'stair', cost: 6 } })],
}
const ladder = (cost: number): Graph => ({
  places: [flat(0, 0, ['foot']), flat(5, 0), flat(5, 5, ['top'])],
  ways: [line(g0(0, 0), g0(5, 5), { nav3d: { word: 'ladder', cost } }), line(g0(0, 0), g0(5, 0), { nav3d: { word: 'ground' } }), line(g0(5, 0), g0(5, 5), { nav3d: { word: 'ground' } })],
})
// The levels again, the stair a spline round from the hall up to the roof, with a clip for whoever walks
// it; and one whose spline starts off its place.
const stair = [[0, 0, 0], [2, 1, 1], [1, 2, 3], [-1, 3, 2], [0, 4, 3]]
const climb = { nav3d: { word: 'stair' }, crowd3d: { clip: 'climb', speed: 0.6 } }
const curved: Graph = { ...levels, ways: [{ spline: { points: stair }, data: climb }] }
const askew: Graph = { ...levels, ways: [{ spline: { points: [[1, 0, 0], ...stair.slice(1)] }, data: climb }] }
// From the floor over the edge onto the wall x = 0: the floor's up, the edge's halfway, the wall's; and
// two whose ups are of the wrong shape.
const S = Math.SQRT1_2
const walls: Graph = {
  places: [place([1, 0, 0], ['floor'], [0, 1, 0]), place([0, 0, 0], undefined, [S, S, 0]), place([0, 1, 0], ['wall'], [1, 0, 0])],
  ways: [line([1, 0, 0], [0, 0, 0], { nav3d: { word: 'ground' } }), line([0, 0, 0], [0, 1, 0], { nav3d: { word: 'ground' } })],
}
const unnormal = { places: [{ point: { at: [0, 0, 0], normal: [0, 1] } }], ways: [] }
const slant = { places: [{ point: { at: [0, 0, 0], normal: [0, 2, 0] } }], ways: [] }
const twice = { places: [flat(0, 0), flat(0, 0)], ways: [] }
const loose = { places: [flat(0, 0), flat(5, 0)], ways: [line(g0(0, 0), g0(4, 0), {})] }
const doubled = { places: [flat(0, 0), flat(0, 0.0001), flat(5, 0)], ways: [line(g0(0, 0), g0(5, 0), {})] }
const bare = { nodes: [], links: [] }
const urls = Object.fromEntries(['land', 'field', 'hand', 'staff', 'levels', 'short', 'long', 'broken', 'curved', 'askew', 'walls', 'unnormal', 'slant', 'twice', 'loose', 'doubled', 'bare']
  .map(k => [k, `/nav3d-sim-test/${k}.nav.json`])) as Record<string, string>
written(urls.land, JSON.stringify(field))
written(urls.field, JSON.stringify({ places: [], ways: [] }))
written(urls.hand, JSON.stringify(hand))
written(urls.staff, JSON.stringify(staff))
written(urls.levels, JSON.stringify(levels))
written(urls.short, JSON.stringify(ladder(3)))
written(urls.long, JSON.stringify(ladder(30)))
written(urls.broken, JSON.stringify({ places: [{ point: { at: [0, 0] } }], ways: [] }))
written(urls.curved, JSON.stringify(curved))
written(urls.askew, JSON.stringify(askew))
written(urls.walls, JSON.stringify(walls))
written(urls.unnormal, JSON.stringify(unnormal))
written(urls.slant, JSON.stringify(slant))
written(urls.twice, JSON.stringify(twice))
written(urls.loose, JSON.stringify(loose))
written(urls.doubled, JSON.stringify(doubled))
written(urls.bare, JSON.stringify(bare))

const BAKE = { area: [-20, -20, 20, 20], clearance: 0.5, around: 8, sample: 1, slope: 0.5, wade: 0.3 }
const json = (url: string) => ({ type: 'json', url, preload: true })
const names = Object.keys(urls).filter(k => k !== 'land')
const yard = {
  world: {
    loader: { assets: Object.fromEntries(Object.entries(urls).map(([k, u]) => [k, json(u)])) },
    terrain3d: { field: 'land' },
    shapes3d: { kinds: { wall: { shape: { box: { size: [6, 3, 0.4] } } } } },
    shipped: { plugins: ['gate'] },
    nav3d: {
      graphs: { ...Object.fromEntries(names.map(k => [k, k === 'field' ? { asset: k, bake: BAKE } : { asset: k }])), unbaked: { asset: 'hand', bake: { ...BAKE, area: [0, 0, 0, 0] } } },
      mods: { solids: ['shapes3d'], height: 'terrain3d', link: 'terrain3d', behaviors: ['gate'] },
    },
  },
  prefabs: { engine: { dt: DT }, scenemanager: { out: {} }, loader: {}, wall: { pos: [0, 0, 0], yaw: 0 }, lever: { open: false }, probe: {} },
  actors: [{ is: 'scenemanager' }, { is: 'loader' }, { is: 'wall', pos: [0, 0, 0], yaw: 0 }, { is: 'lever' }, { is: 'probe' }],
  plugins: ['scenemanager'],
}

const dir = mkdtempSync(join(tmpdir(), 'nav3d-sim-'))
const path = (p: string) => JSON.stringify(new URL(p, import.meta.url).pathname)
writeFileSync(join(dir, 'yard.scene.json'), JSON.stringify(yard))
writeFileSync(join(dir, 'yard.sim.ts'), `
import { scenemanager } from ${path('../scenemanager/scenemanager.sim.ts')}
import { loader } from ${path('../loader/loader.sim.ts')}
import file from './yard.scene.json' with { type: 'json' }
export const sim = { scenemanager, loader, wall: {}, lever: {}, probe: { before(_me, _dt, w) { globalThis.nav3dYard = w } } }
export const scene = file
`)
// The game's own plugin that brings gates: one costs 1 to cross while the lever is open, and cannot be
// crossed while it is shut; one for the staff is crossed only by a route asked for the staff.
mkdirSync(join(dir, 'plugins', 'gate'), { recursive: true })
writeFileSync(join(dir, 'plugins', 'gate', 'gate.nav3d.ts'),
  'export const behaviors = () => ({ gate: (w, data, _way, who) => (!w.find(\'lever\').data.open || (data.staff && who !== \'staff\') ? undefined : 1) })\n')
afterAll(() => rmSync(dir, { recursive: true }))

const top: Scene = {
  prefabs: { engine: { dt: DT }, scenemanager: { scenes: { yard: { file: 'yard.scene.json', suspend: false } }, dt: DT, entry: 'yard', port: 0 } },
  actors: [{ is: 'scenemanager' }],
  plugins: ['scenemanager'],
  seats: 1,
}

async function booted() {
  const child = (await load(boot(structuredClone(top), { scenemanager }), pathToFileURL(dir + '/').href)).get('yard')!
  child.step(DT)
  return (globalThis as { nav3dYard?: W }).nav3dYard!
}

// Whether the walk from a to b [x, z] passes inside the wall's footprint.
const throughWall = (a: number[], b: number[]) => {
  for (let k = 0; k <= 1000; k++) {
    const x = a[0] + ((b[0] - a[0]) * k) / 1000, z = a[1] + ((b[1] - a[1]) * k) / 1000
    if (Math.abs(x) < 3 && Math.abs(z) < 0.2) return true
  }
  return false
}
const fixed = (p: number[]) => p.map(v => +v.toFixed(9))

test('the bake puts a place off each corner of the wall grown by the clearance, and joins them by lines round it and never through it', async () => {
  const w = await booted()
  const g = graphOf(w, 'field')
  expect(g.places.map(p => fixed(p.point.at))).toEqual([[-3.5, 0, -0.7], [3.5, 0, -0.7], [3.5, 0, 0.7], [-3.5, 0, 0.7]])
  // The long sides and the two ends; the diagonals cross the wall.
  const index = (p: number[]) => g.places.findIndex(q => q.point.at.every((v, i) => v === p[i]))
  expect(g.ways.map(wy => pointsOf(wy).map(index))).toEqual([[0, 1], [0, 3], [1, 2], [2, 3]])
  for (const wy of g.ways) {
    expect('line' in wy).toBe(true)
    expect(wordOf(wy)).toBe('ground')
    expect(wy.data!.ground).toEqual({})
    const [p, q] = pointsOf(wy)
    expect(wy.data!.nav3d!.cost).toBeCloseTo(Math.hypot(q[0] - p[0], q[2] - p[2]), 9)
  }
  expect(g.blocks).toEqual([g.places.map(p => [p.point.at[0], p.point.at[2]])])
})

test('a route from one side of the wall to the other goes round its end, and never through it', async () => {
  const w = await booted()
  written(urls.field, JSON.stringify(graphOf(w, 'field')))
  const steps = route(w, 'field', [0, 0, -5], [0, 0, 5])!
  expect(steps.map(s => s.place)).toEqual([1, 2, null])
  expect(steps.map(s => fixed(s.at))).toEqual([[3.5, 0, -0.7], [3.5, 0, 0.7], [0, 0, 5]])
  // Joins have no way; the leg round the end is the bake's line, its course run into the step's place.
  expect(steps[0].way).toBeNull()
  expect(steps[0].course).toBeNull()
  expect(wordOf(steps[1].way!)).toBe('ground')
  expect((steps[1].course as { line: { from: number[]; to: number[] } }).line.to).toEqual(steps[1].at)
  let was = [0, -5]
  for (const s of steps) {
    expect(throughWall(was, [s.at[0], s.at[2]])).toBe(false)
    was = [s.at[0], s.at[2]]
  }
})

test('with nothing between them, a route is the goal alone; one asked twice is the same', async () => {
  const w = await booted()
  written(urls.field, JSON.stringify(graphOf(w, 'field')))
  expect(route(w, 'field', [-10, 0, -5], [-10, 0, 5])).toEqual([{ at: [-10, 0, 5], place: null, way: null, course: null }])
  expect(route(w, 'field', [0, 0, -5], [0, 0, 5])).toEqual(route(w, 'field', [0, 0, -5], [0, 0, 5]))
})

test('on a graph with no blocks, a route joins each end to its nearest place, and reaches a tag', async () => {
  const w = await booted()
  // The gate is shut, so round by the far corner.
  const round = route(w, 'hand', [0, 0, -1], 'kitchen')!
  expect(round.map(s => s.place)).toEqual([0, 1, 2])
  expect(round.map(s => s.at)).toEqual([[0, 0, 0], [10, 0, 0], [10, 0, 10]])
  // A place joins its nearest place, then the place itself.
  expect(route(w, 'hand', [0, 0, -1], [10, 0, 11])!.map(s => s.at)).toEqual([[0, 0, 0], [10, 0, 0], [10, 0, 10], [10, 0, 11]])
})

test('a way with no cost of its own costs its length; one with a cost costs that', async () => {
  const w = await booted()
  // The levels' stair is 5 m long and costs 6; the ladder is 7.07 m long and costs 3 or 30.
  expect(route(w, 'short', [0, 0, -1], 'top')!.map(s => s.place)).toEqual([0, 2])
  expect(route(w, 'long', [0, 0, -1], 'top')!.map(s => s.place)).toEqual([0, 1, 2])
})

test('on a graph of levels, a route from the roof joins the roof\'s place, not the floor\'s under it, and goes down the stair with its heights', async () => {
  const w = await booted()
  // Across the ground the hall's place is nearer, 0.5 m off; in all three the roof's, 2.5 m along the roof.
  const down = route(w, 'levels', [0, 4, 0.5], 'hall')!
  expect(down.map(s => s.place)).toEqual([1, 0])
  expect(down.map(s => s.at)).toEqual([[0, 4, 3], [0, 0, 0]])
  // The stair's line, run the way down.
  expect(down[1].course).toEqual({ line: { from: [0, 4, 3], to: [0, 0, 0] } })
})

test('a way a behavior says cannot be crossed now is not taken; when it can, its cost is the behavior\'s', async () => {
  const w = await booted()
  w.find('lever').data.open = true
  const through = route(w, 'hand', [0, 0, -1], 'kitchen')!
  expect(through.map(s => s.place)).toEqual([0, 3, 2])
  expect(wordOf(through[1].way!)).toBe('gate')
  w.find('lever').data.open = false
  expect(route(w, 'hand', [0, 0, -1], 'kitchen')!.map(s => s.place)).toEqual([0, 1, 2])
})

test('a behavior is handed who the route is for: a gate for the staff is crossed by the staff alone', async () => {
  const w = await booted()
  w.find('lever').data.open = true
  expect(route(w, 'staff', [0, 0, -1], 'kitchen', 'staff')!.map(s => s.place)).toEqual([0, 3, 2])
  expect(route(w, 'staff', [0, 0, -1], 'kitchen', 'guest')!.map(s => s.place)).toEqual([0, 1, 2])
  expect(route(w, 'staff', [0, 0, -1], 'kitchen')!.map(s => s.place)).toEqual([0, 1, 2])
  w.find('lever').data.open = false
})

test('a one-way way is crossed its own way alone, and a place no way reaches has no route', async () => {
  const w = await booted()
  expect(route(w, 'hand', [0, 0, -1], 'loft')).toBeUndefined()
  expect(route(w, 'hand', [20, 0, -1], 'yard')!.map(s => s.place)).toEqual([4, 1, 0])
  expect(route(w, 'hand', [0, 0, -1], 'island')).toBeUndefined()
  expect(route(w, 'hand', [0, 0, -1], 'nowhere')).toBeUndefined()
})

test('a way of a word nothing delivered costs its own cost: taken when it is the cheaper way, and not when it is dearer', async () => {
  const w = await booted()
  const up = route(w, 'short', [0, 0, -1], 'top')!
  expect(up.map(s => s.place)).toEqual([0, 2])
  expect(wordOf(up[1].way!)).toBe('ladder')
  expect(route(w, 'long', [0, 0, -1], 'top')!.map(s => s.place)).toEqual([0, 1, 2])
})

test('a spline way is routed as any way, costs its length along its curve, carries its data on the step, and its course runs the way it is crossed', async () => {
  const w = await booted()
  const up = route(w, 'curved', [0, 0, -0.5], 'roof')!
  expect(up.map(s => s.place)).toEqual([0, 1])
  expect(wordOf(up[1].way!)).toBe('stair')
  // What happens on it is said on it: the step carries the way's data for whoever walks it.
  expect(up[1].way!.data!.crowd3d).toEqual({ clip: 'climb', speed: 0.6 })
  expect(up[1].course).toEqual({ spline: { points: stair } })
  const down = route(w, 'curved', [0, 4, 3.5], 'hall')!
  expect(down.map(s => s.place)).toEqual([1, 0])
  expect(down[1].course).toEqual({ spline: { points: [...stair].reverse() } })
  // Its cost is its length along the curve: a route from the hall to the roof by the curve costs that.
  const { at } = drawn({ points: stair })
  expect(at[at.length - 1]).toBeGreaterThan(5)
  // npc3d's route over the one graph: the stair's step its spline, run the way the route crosses it.
  const only = (name: string) => Object.assign(Object.create(w), { world: { ...w.world, nav3d: { ...w.world.nav3d, graphs: { [name]: w.world.nav3d.graphs[name] } } } }) as W
  expect(npcRoute(only('curved'), [0, 0, -0.5], [0, 4, 3])).toEqual([[0, 0, 0], { spline: { points: stair } }, [0, 4, 3]])
  expect(npcRoute(only('curved'), [0, 4, 3.5], [0, 0, 0])).toEqual([[0, 4, 3], { spline: { points: [...stair].reverse() } }, [0, 0, 0]])
  // A graph of lines hands npc3d its places.
  expect(npcRoute(only('levels'), [0, 0, -0.5], [0, 4, 3])).toEqual([[0, 0, 0], [0, 4, 3], [0, 4, 3]])
})

test('a graph file of the wrong shape and a graph not named throw, naming them', async () => {
  const w = await booted()
  expect(() => route(w, 'broken', [0, 0, 0], [5, 0, 0])).toThrow('nav3d graph broken: place 0\'s at is not [x, y, z]')
  expect(() => route(w, 'askew', [0, 0, 0], [5, 0, 0])).toThrow('nav3d graph askew: way 0\'s first end stands on 0 places: it stands on one')
  expect(() => route(w, 'loose', [0, 0, 0], [5, 0, 0])).toThrow('nav3d graph loose: way 0\'s last end stands on 0 places: it stands on one')
  expect(() => route(w, 'doubled', [0, 0, 0], [5, 0, 0])).toThrow('nav3d graph doubled: way 0\'s first end stands on 2 places: it stands on one')
  expect(() => route(w, 'unnormal', [0, 0, 0], [5, 0, 0])).toThrow('nav3d graph unnormal: place 0\'s normal is not [x, y, z]')
  expect(() => route(w, 'slant', [0, 0, 0], [5, 0, 0])).toThrow('nav3d graph slant: place 0\'s normal is not a unit vector')
  expect(() => route(w, 'bare', [0, 0, 0], [5, 0, 0])).toThrow('nav3d graph bare: a graph is { places: [], ways: [] }')
  expect(() => route(w, 'gone', [0, 0, 0], [5, 0, 0])).toThrow(`nav3d has no graph gone: world.nav3d.graphs names ${[...names, 'unbaked'].join(', ')}`)
  // Two places at one spot are a graph, until a way's end stands on both.
  expect(route(w, 'twice', [0, 0, -1], [0, 0, 1])).toBeDefined()
})

test('a graph whose places give their ground\'s up carries it on each step, the goal place the up of the place it joins from, and on npc3d\'s legs', async () => {
  const w = await booted()
  const up = route(w, 'walls', [1, 0, 0.2], [0, 1.5, 0])!
  expect(up.map(s => s.place)).toEqual([0, 1, 2, null])
  expect(up.map(s => s.normal)).toEqual([[0, 1, 0], [S, S, 0], [1, 0, 0], [1, 0, 0]])
  // A graph whose places give none hands steps with none.
  expect(route(w, 'levels', [0, 4, 0.5], 'hall')!.every(s => !('normal' in s))).toBe(true)
  const only = Object.assign(Object.create(w), { world: { ...w.world, nav3d: { ...w.world.nav3d, graphs: { walls: w.world.nav3d.graphs.walls } } } }) as W
  expect(npcRoute(only, [1, 0, 0.2], [0, 1.5, 0])).toEqual([
    { at: [1, 0, 0], normal: [0, 1, 0] }, { at: [0, 0, 0], normal: [S, S, 0] }, { at: [0, 1, 0], normal: [1, 0, 0] }, { at: [0, 1.5, 0], normal: [1, 0, 0] },
  ])
})

test('the bake throws on a graph with no rules and on rules of the wrong value', async () => {
  const w = await booted()
  expect(() => graphOf(w, 'hand')).toThrow('nav3d graph hand has no bake: world.nav3d.graphs.hand.bake gives the rules it is made by')
  expect(() => graphOf(w, 'unbaked')).toThrow('nav3d graph unbaked\'s bake area is not [x0, z0, x1, z1] with x0 < x1 and z0 < z1')
})

test('a round footprint grows into a ring that holds the circle; a turned one moves each side out by the clearance', () => {
  const ring = grow({ points: [[2, 3]], round: 1 }, 0.5, 8)
  expect(ring).toHaveLength(8)
  // Each side of the ring stands the grown radius from the middle.
  for (let k = 0; k < 8; k++) {
    const p = ring[k], q = ring[(k + 1) % 8]
    expect(Math.hypot((p[0] + q[0]) / 2 - 2, (p[1] + q[1]) / 2 - 3)).toBeCloseTo(1.5, 9)
  }
  const c = Math.cos(0.6), s = Math.sin(0.6)
  const square = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([x, z]) => [x * c + z * s, -x * s + z * c])
  const out = grow({ points: square, round: 0 }, 0.5, 8)
  // Each corner moves out along the corner's diagonal by the clearance times √2.
  out.forEach(p => expect(Math.hypot(p[0], p[1])).toBeCloseTo(Math.SQRT2 * 1.5, 9))
  expect(out.map((p, i) => Math.atan2(p[1], p[0]) - Math.atan2(square[i][1], square[i][0])).every(d => Math.abs(Math.sin(d)) < 1e-9)).toBe(true)
})
