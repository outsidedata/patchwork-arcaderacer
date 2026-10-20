// The camera of a world cut into rooms. First its sums, driven as a seat's actor drives it, with
// render2d, whose camera it moves, in a top-down world of 8-pixel cells on a canvas 256 by 224, so the
// view is 32 cells across and 28 down, and in one whose y grows up the screen. Then booted: a scene
// the test writes, listing it, and a page on it over a loopback whose actor hands it its row's point
// and room each frame, as a game's does, read back through render2d's camera.
import { afterAll, expect, test, vi } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { boot, type Scene } from '#engine/engine.ts'
import { accept, link, load, manager, view } from '#addons/scenemanager/scenemanager.addon.ts'
import { loopback } from '#addons/loopback/loopback.addon.ts'
import { scenemanager } from '#plugins/scenemanager/scenemanager.sim.ts'
import { render2d } from '#plugins/render2d/render2d.plugin.ts'
import { roomcamera, type Rect } from './roomcamera.plugin.ts'

function made(zoom = 1, ground = [[8, 0], [0, 8]]) {
  const r = render2d(), c = roomcamera()
  const scene = {
    plugins: ['roomcamera', 'render2d'], actors: [],
    world: { render2d: { ground, up: [0, -8], zoom, look: [0, 0], layers: ['things'] } },
    prefabs: { engine: { dt: 1 / 60, width: 256, height: 224 } },
  }
  const plugins: any = { wire: { n: 0, ack: 0, rows: [], home: 'file:///nowhere/', scene, send: () => 0 }, render2d: r, roomcamera: c }
  r.tick(plugins)
  return { plugins, look: (...args: [number[], Rect, Rect?, number?]) => { c.look(plugins, ...args); return r.camera().look } }
}

const hall: Rect = [10, 20, 100, 60], cell: Rect = [120, 20, 20, 60], closet: Rect = [120, 90, 20, 20]

test('in a room bigger than the view, the view looks at the point, held in so it shows nothing past the room', () => {
  const { look } = made()
  expect(look([60, 50], hall)).toEqual([60, 50])
  expect(look([12, 22], hall)).toEqual([10 + 16, 20 + 14])
  expect(look([108, 78], hall)).toEqual([110 - 16, 80 - 14])
})

test('along an axis on which the room is no bigger than the view, the view looks at its middle', () => {
  const { look } = made()
  expect(look([125, 30], cell)).toEqual([130, 20 + 14])
  expect(look([135, 100], closet)).toEqual([130, 100])
})

test('while the point walks into the next room, the view is as far along from where it was held to where it is held', () => {
  const { look } = made()
  const at = [121, 50]
  expect(look(at, cell, hall, 0)).toEqual([110 - 16, 50])
  expect(look(at, cell, hall, 0.5)).toEqual([(94 + 130) / 2, 50])
  expect(look(at, cell, hall, 1)).toEqual([130, 50])
})

test('zoomed in, the view is smaller in the world: held nearer the edges, and following the point along a room now bigger than it', () => {
  const { look } = made(2)
  expect(look([12, 22], hall)).toEqual([10 + 8, 20 + 7])
  expect(look([125, 30], cell)).toEqual([120 + 8, 30])
})

test('in a world whose y grows up the screen, the view is held in the room all the same', () => {
  const { look } = made(1, [[8, 0], [0, -8]])
  expect(look([60, 50], hall)).toEqual([60, 50])
  expect(look([12, 22], hall)).toEqual([10 + 16, 20 + 14])
  expect(look([125, 30], cell)).toEqual([130, 20 + 14])
})

// A scene of one row, `walker`, whose page actor hands the room camera its row's `pos` and `room`
// [x, y, w, h] every frame, as a game's seat does, and the manager that enters it.
const DT = 1 / 60
const field: Scene = {
  world: { render2d: { ground: [[8, 0], [0, 8]], up: [0, -8], zoom: 1, look: [0, 0], layers: ['things'] } },
  plugins: ['scenemanager', 'roomcamera', 'render2d'],
  seats: 1,
  prefabs: { engine: { dt: DT, width: 256, height: 224 }, scenemanager: { out: {} }, walker: { pos: [60, 50], room: hall } },
  actors: [{ is: 'scenemanager' }, { is: 'walker' }],
}
const top: Scene = {
  world: {},
  plugins: ['scenemanager'],
  seats: 1,
  prefabs: { engine: { dt: DT }, scenemanager: { scenes: { field: { file: 'field.scene.json', suspend: false } }, dt: DT, entry: 'field', port: 0 } },
  actors: [{ is: 'scenemanager' }],
}
const dir = mkdtempSync(join(tmpdir(), 'roomcamera-'))
afterAll(() => rmSync(dir, { recursive: true }))
writeFileSync(join(dir, 'field.scene.json'), JSON.stringify(field))
writeFileSync(join(dir, 'field.sim.ts'), `
import { scenemanager } from ${JSON.stringify(new URL('../scenemanager/scenemanager.sim.ts', import.meta.url).pathname)}
import file from './field.scene.json' with { type: 'json' }
export const sim = { scenemanager, walker: {} }
export const scene = file
`)
writeFileSync(join(dir, 'walker.client.ts'), `export function setup() {}
export function tick(row, plugins) { plugins.roomcamera.look(plugins, row.data.pos, row.data.room) }
export function remove() {}
`)

test('booted: a scene listing it loads it, and an actor handing it its point and room each frame moves the camera render2d draws with', async () => {
  vi.stubGlobal('addEventListener', () => {})
  vi.stubGlobal('removeEventListener', () => {})
  const home = pathToFileURL(dir + '/').href
  const truth = boot(structuredClone(top), { scenemanager })
  const field = (await load(truth, home)).get('field')!
  const tab = view(link(loopback(accept(manager(truth)))), top, home, () => {})
  const frames = async (n: number) => { for (let i = 0; i < n; i++) { truth.step(DT); await tab.frame() } }
  await frames(3)
  const camera = () => tab.client!.plugins.render2d.camera().look
  expect(camera()).toEqual([60, 50])
  field.rows.find(r => r.kind === 'walker')!.data.pos = [12, 22]
  await frames(2)
  expect(camera()).toEqual([10 + 16, 20 + 14])
  tab.close()
})
