// tilemap's mod for box2d, given to box2d by one key of a scene: `world.box2d.mods.ground` is
// 'tilemap'. The test writes a Tiled map, a floor of solid tiles with a one-way ledge over it, and a
// manager and one child, `level`, which `load` boots as a game's would. The child's box2d world is
// in cells with y down the rows, as the map's is, so its gravity is +y; its `probe` hands the test
// the child's `w`. What is held is the wiring: every tile's `shapes` are in one chunk of box2d's
// world, and the ground door builds and drops the chunks as the row lists.
import { afterAll, expect, test } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { boot, type Scene, type Truth, type W } from '#engine/engine.ts'
import { load } from '#addons/scenemanager/scenemanager.addon.ts'
import { scenemanager } from '#plugins/scenemanager/scenemanager.sim.ts'
import { tiled, written } from '#plugins/loader/loader.sim.ts'
import { castRay, castRayClosest, counters } from '#plugins/box2d/box2d.sim.ts'
import { ground } from './tilemap.box2d.ts'
import { shapes } from './tilemap.sim.ts'

const DT = 1 / 60
const rect = (x: number, y: number, w: number, h: number, type = '') => ({ id: 1, x, y, width: w, height: h, type })
const ROWS = [
  '................',
  '................',
  '................',
  '....====........',
  '................',
  '................',
  '################',
  '################',
]
const width = ROWS[0].length
const url = '/tilemap-box2d-test/level.tmj'
written(url, JSON.stringify({
  type: 'map', orientation: 'orthogonal', width, height: ROWS.length, tilewidth: 16, tileheight: 16, infinite: false,
  tilesets: [{
    firstgid: 1, name: 't', tilewidth: 16, tileheight: 16, tilecount: 2, columns: 2, image: 't.png', imagewidth: 32, imageheight: 16,
    tiles: [
      { id: 0, objectgroup: { type: 'objectgroup', objects: [rect(0, 0, 16, 16)] } },
      { id: 1, objectgroup: { type: 'objectgroup', objects: [rect(0, 0, 16, 4, 'top')] } },
    ],
  }],
  layers: [{ type: 'tilelayer', name: 'ground', width, height: ROWS.length, x: 0, y: 0, visible: true, opacity: 1, data: ROWS.flatMap(r => [...r].map(ch => ch === '#' ? 1 : ch === '=' ? 2 : 0)) }],
}))

const top: Scene = {
  prefabs: { engine: { dt: DT }, scenemanager: { scenes: { level: { file: 'level.scene.json', suspend: false } }, dt: DT, entry: 'level', port: 0 } },
  actors: [{ is: 'scenemanager' }],
  plugins: ['scenemanager'],
  seats: 1,
}
const at = (pos: number[]) => ({ pos, rot: [1, 0], vel: [0, 0], spin: 0, awake: true })
const level = {
  world: {
    loader: { assets: { level: { type: 'tilemap', url, preload: true } } },
    tilemap: { file: 'level' },
    box2d: {
      gravity: [0, 10], subStepCount: 4, static: [],
      kinds: { crate: { type: 'dynamic', shapes: [{ box: [0.25, 0.25] }] } },
      mods: { ground: 'tilemap' },
      chunk: { count: 4 },
    },
  },
  prefabs: { engine: { dt: DT, width: 320, height: 200 }, scenemanager: { out: {} }, loader: {}, tilemap: {}, box2d: {}, crate: at([0, 0]), probe: {} },
  actors: [{ is: 'scenemanager' }, { is: 'loader' }, { is: 'tilemap' }, { is: 'box2d' }, { is: 'probe' }],
  plugins: ['scenemanager'],
}

const dir = mkdtempSync(join(tmpdir(), 'tilemap-box2d-'))
const path = (p: string) => JSON.stringify(new URL(p, import.meta.url).pathname)
writeFileSync(join(dir, 'level.scene.json'), JSON.stringify(level))
writeFileSync(join(dir, 'level.sim.ts'), `
import { scenemanager } from ${path('../scenemanager/scenemanager.sim.ts')}
import { loader } from ${path('../loader/loader.sim.ts')}
import { tilemap } from ${path('./tilemap.sim.ts')}
import { box2d } from ${path('../box2d/box2d.sim.ts')}
import file from './level.scene.json' with { type: 'json' }
export const sim = { scenemanager, loader, tilemap, box2d, crate: {}, probe: { after(_me, _dt, w) { globalThis.level = w } } }
export const scene = file
`)
afterAll(() => rmSync(dir, { recursive: true }))

const child = async () => (await load(boot(structuredClone(top), { scenemanager }), pathToFileURL(dir + '/').href)).get('level')!
const run = (t: Truth, k: number) => { for (let i = 0; i < k; i++) t.step(DT) }
const wOf = (): W => (globalThis as any).level
const box2dRow = (t: Truth) => t.rows.find(r => r.kind === 'box2d')!
const ALL = [[0, 0], [1, 0], [2, 0], [3, 0], [0, 1], [1, 1], [2, 1], [3, 1]]

test('every tile\'s shapes are in one chunk and no other', async () => {
  const t = await child()
  run(t, 1)
  const w = wOf()
  const map = tiled(w, 'level')
  const every = ALL.flatMap(([i, j]) => ground(w, [i, j]).shapes)
  expect(every).toHaveLength(shapes(map, undefined, { x: 0, y: 0, w: 16, h: 8 }).length)
  expect(every.filter(s => s.oneWay)).toHaveLength(4)
})

test('listed, the chunks are box2d\'s ground: a ray down the rows meets the floor\'s top and the ledge\'s, by the row id 0', async () => {
  const t = await child()
  box2dRow(t).data.ground = ALL
  run(t, 1)
  const w = wOf()
  expect(counters(w).bodyCount).toBe(ALL.length)
  const floor = castRayClosest(w, [10.5, 0], [0, 20])!
  expect(floor.id).toBe(0)
  expect(floor.point[1]).toBeCloseTo(6, 5)
  const ledge = castRayClosest(w, [5.5, 0], [0, 20])!
  expect(ledge.point[1]).toBeCloseTo(3, 5)
})

test('a crate dropped on the ledge lands on it, and one thrown up through it passes it and lands on it', async () => {
  const t = await child()
  box2dRow(t).data.ground = ALL
  const onto = t.spawn('crate', { pos: [5.5, 1] })
  const through = t.spawn('crate', { pos: [4.5, 5.5], vel: [0, -9] })
  let highest = 5.5
  for (let i = 0; i < 180; i++) { t.step(DT); highest = Math.min(highest, through.data.pos[1]) }
  expect(onto.data.pos[1]).toBeLessThan(3)
  expect(highest).toBeLessThan(3)
  expect(through.data.pos[1]).toBeLessThan(3)
})

test('unlisting a chunk drops it and what rested on it falls; listing it again builds it with the tilemap row\'s edits', async () => {
  const t = await child()
  const row = box2dRow(t)
  row.data.ground = ALL
  const crate = t.spawn('crate', { pos: [10.5, 5] })
  run(t, 120)
  const rested = crate.data.pos[1]
  row.data.ground = ALL.filter(([i, j]) => !(i === 2 && j === 1))
  crate.data.awake = true
  run(t, 60)
  expect(counters(wOf()).bodyCount).toBe(ALL.length)
  expect(crate.data.pos[1]).toBeGreaterThan(rested + 1)
  // The floor's column under x = 10 broken in the tilemap row's edits, and the chunk listed again.
  const tm = t.rows.find(r => r.kind === 'tilemap')!
  tm.data.edits = { 'ground:10,6': -1, 'ground:10,7': -1 }
  row.data.ground = ALL
  run(t, 1)
  expect(castRay(wOf(), [10.5, 0], [0, 20]).filter(h => h.id === 0)).toEqual([])
  expect(castRayClosest(wOf(), [11.5, 0], [0, 20])!.point[1]).toBeCloseTo(6, 5)
})
