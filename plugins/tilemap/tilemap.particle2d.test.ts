// tilemap's mod for particle2d, given by one key of a scene: `world.particle2d.mods.solids` is
// ['tilemap']. The test reads a Tiled map, a wall one cell thick down column 5 and a one-way ledge in
// row 3, and hands a page render2d, particle2d and a stand-in loader holding the map and an effects
// file, with the mod loaded as the scenemanager loads it.
import { expect, test } from 'vitest'
import { mod, prepare } from '#addons/scenemanager/scenemanager.addon.ts'
import { readMap } from '#plugins/loader/loader.sim.ts'
import { render2d } from '#plugins/render2d/render2d.plugin.ts'
import { particle2d, type Effects } from '#plugins/particle2d/particle2d.plugin.ts'
import { solids } from './tilemap.particle2d.ts'

const DT = 1 / 60
const rect = (x: number, y: number, w: number, h: number, type = '') => ({ id: 1, x, y, width: w, height: h, type })
const ROWS = [
  '.....#..........',
  '.....#..........',
  '.....#..........',
  '.....#..====....',
  '.....#..........',
  '.....#..........',
  '.....#..........',
  '.....#..........',
]
const width = ROWS[0].length
const map = readMap({
  type: 'map', orientation: 'orthogonal', width, height: ROWS.length, tilewidth: 16, tileheight: 16, infinite: false,
  tilesets: [{
    firstgid: 1, name: 't', tilewidth: 16, tileheight: 16, tilecount: 2, columns: 2, image: 't.png', imagewidth: 32, imageheight: 16,
    tiles: [
      { id: 0, objectgroup: { type: 'objectgroup', objects: [rect(0, 0, 16, 16)] } },
      { id: 1, objectgroup: { type: 'objectgroup', objects: [rect(0, 0, 16, 4, 'top')] } },
    ],
  }],
  layers: [{ type: 'tilelayer', name: 'ground', width, height: ROWS.length, x: 0, y: 0, visible: true, opacity: 1, data: ROWS.flatMap(r => [...r].map(ch => ch === '#' ? 1 : ch === '=' ? 2 : 0)) }],
}, '/tilemap-particle2d-test/level.tmj')

const effects: Effects = { cap: 10, layer: 'effects', effects: { spark: [{ life: [2, 2], dir: [1, 0], spread: 0, speed: [240, 240], bounce: 1 }] } }

const page = async (ground: number[][]) => {
  const world: any = {
    render2d: { ground, up: [0, -16], zoom: 1, look: [0, 0], layers: ['effects'] },
    tilemap: { file: 'level' },
    particle2d: { effects: 'effects', hold: 0.1, mods: { solids: ['tilemap'] } },
  }
  await prepare({} as any, [], world)
  const plugins: any = {
    wire: { rows: [{ id: 1, kind: 'tilemap', data: { edits: {} } }], scene: { plugins: ['loader', 'particle2d', 'render2d'], world, prefabs: { engine: { dt: DT, width: 400, height: 300 } } } },
    render2d: render2d(),
    loader: {
      on: (_: string, f: (it: any) => void) => f(effects),
      get: (name: string) => (name === 'level' ? { map } : undefined),
      load: () => {}, onWritten: () => {},
    },
  }
  plugins.render2d.tick(plugins)
  return { plugins, world, me: particle2d() }
}

test('a spark with a bounce bounces off the map\'s wall where render2d draws it, and back the way it came', async () => {
  const { plugins, world, me } = await page([[16, 0], [0, 16]])
  expect(mod(world, 'particle2d', 'solids')).toBe(solids)
  // thrown right from 48 short of the wall's face at x 80
  me.emit('spark', [2, 1.5])
  for (let f = 0; f < 31; f++) me.afterTick(plugins)
  const s = plugins.render2d.layer('effects').children[0].children[0]
  // half a second at 240: 48 to the wall and 72 back
  expect(s.position.x).toBeCloseTo(80 - 72, 2)
  expect(s.position.y).toBeCloseTo(24, 9)
})

test('a one-way ledge is met from above alone, and a cell an edit took out is met by nothing', async () => {
  const { plugins } = await page([[16, 0], [0, 16]])
  const meet = solids(plugins)
  expect(meet([152, 20], [0, 1], 100)).toEqual({ t: 28, normal: [0, -1] })
  expect(meet([152, 80], [0, -1], 100)).toBeUndefined()
  plugins.wire.rows[0].data.edits = { 'ground:5,1': -1 }
  expect(solids(plugins)([40, 24], [1, 0], 100)).toBeUndefined()
  expect(solids(plugins)([40, 40], [1, 0], 100)).toEqual({ t: 40, normal: [-1, 0] })
})

test('in an isometric world the wall is met where render2d draws its cells, its normal facing out of them on the stage', async () => {
  const { plugins } = await page([[32, 16], [-32, 16]])
  // from the ground point 2, 2.5 along the world's x: the wall's face is 3 cells on
  const from = plugins.render2d.place([2, 2.5]), step = Math.hypot(32, 16)
  const hit = solids(plugins)(from, [32 / step, 16 / step], 400)!
  expect(hit.t).toBeCloseTo(3 * step, 9)
  const n = Math.hypot(16, 32)
  expect(hit.normal[0]).toBeCloseTo(-16 / n, 9)
  expect(hit.normal[1]).toBeCloseTo(-32 / n, 9)
})
