// shapes3d's mod for box3d, named by the scene's `world.box3d.mods.fixed`. The test writes a manager and
// one child, `yard`, which `load` boots as a game's would: box3d with no `static` of its own, standing
// every shape on shapes3d's: a floor (a box whose top is y = 0), a block (a turned box 1 m tall), a post
// (a cylinder drawn as a prism of 8 sides), a beam (a box raised 6 m), and two ramps (planes tilted up
// along their length), one of a grippy surface and one of none. Crates are dropped on them. Its `probe`
// hands the test the child's `w`.
import { afterAll, expect, test } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { boot, type Row, type Scene, type Truth, type W } from '#engine/engine.ts'
import { load, modsOf } from '#addons/scenemanager/scenemanager.addon.ts'
import { scenemanager } from '#plugins/scenemanager/scenemanager.sim.ts'
import { castRayClosest } from '#plugins/box3d/box3d.sim.ts'
import { fixed } from './shapes3d.box3d.ts'

const DT = 1 / 60
const SIDES = 8, RADIUS = 0.5, TURN = 0.6, TILT = Math.atan(0.25)
const ramp = (friction: number) => ({ shape: { plane: { size: [2, 4], tilt: TILT } }, look: { colour: '#777777', thick: 0.2 }, surface: { friction } })
const shapes3d = {
  kinds: {
    floor: { shape: { box: { size: [40, 1, 40] } }, surface: { friction: 0.9, restitution: 0 } },
    block: { shape: { box: { size: [2, 1, 1] } } },
    post: { shape: { cylinder: { radius: RADIUS, height: 3 } }, look: { colour: '#777777', sides: SIDES } },
    beam: { shape: { box: { size: [1, 0.5, 1] } } },
    grippy: ramp(1),
    slick: ramp(0),
  },
}
const at = (pos: number[]) => ({ pos, rot: [0, 0, 0, 1], vel: [0, 0, 0], spin: [0, 0, 0], awake: true })
const placed = { pos: [0, 0, 0], yaw: 0 }
const yard = {
  world: {
    shapes3d,
    box3d: {
      gravity: [0, -10, 0], subStepCount: 4, static: [],
      kinds: { crate: { type: 'dynamic', shapes: [{ box: [0.25, 0.25, 0.25], density: 1000, baseMaterial: { friction: 0.6 } }] } },
      joints: { rope: { type: 'distance', length: 2, enableSpring: false } },
      mods: { fixed: ['shapes3d'] },
    },
  },
  prefabs: {
    engine: { dt: DT }, scenemanager: { out: {} }, box3d: {}, crate: at([0, 0, 0]), rope: {}, probe: {},
    floor: placed, block: placed, post: placed, beam: placed, grippy: placed, slick: placed,
  },
  actors: [
    { is: 'scenemanager' }, { is: 'box3d' },
    { is: 'floor', pos: [0, -1, 0] }, { is: 'block', pos: [0, 0, 6], yaw: TURN }, { is: 'post', pos: [8, 0, 0] },
    { is: 'beam', pos: [-8, 6, 8] }, { is: 'grippy', pos: [-8, 1, -8] }, { is: 'slick', pos: [-4, 1, -8] },
    { is: 'probe' },
  ],
  plugins: ['scenemanager'],
}

const dir = mkdtempSync(join(tmpdir(), 'shapes3d-box3d-'))
const path = (p: string) => JSON.stringify(new URL(p, import.meta.url).pathname)
writeFileSync(join(dir, 'yard.scene.json'), JSON.stringify(yard))
writeFileSync(join(dir, 'yard.sim.ts'), `
import { scenemanager } from ${path('../scenemanager/scenemanager.sim.ts')}
import { box3d } from ${path('../box3d/box3d.sim.ts')}
import file from './yard.scene.json' with { type: 'json' }
export const sim = { scenemanager, box3d, crate: {}, rope: {}, floor: {}, block: {}, post: {}, beam: {}, grippy: {}, slick: {}, probe: { after(_me, _dt, w) { globalThis.shapes3dBox3d = w } } }
export const scene = file
`)
afterAll(() => rmSync(dir, { recursive: true }))

const top: Scene = {
  prefabs: { engine: { dt: DT }, scenemanager: { scenes: { yard: { file: 'yard.scene.json', suspend: false } }, dt: DT, entry: 'yard', port: 0 } },
  actors: [{ is: 'scenemanager' }],
  plugins: ['scenemanager'],
  seats: 1,
}
const run = (t: Truth, k: number) => { for (let i = 0; i < k; i++) t.step(DT) }
async function booted() {
  const child = (await load(boot(structuredClone(top), { scenemanager }), pathToFileURL(dir + '/').href)).get('yard')!
  run(child, 1)
  return { child, w: (globalThis as { shapes3dBox3d?: W }).shapes3dBox3d!, row: (kind: string): Row => child.rows.find(r => r.kind === kind)! }
}

test('the scene\'s mod is shapes3d\'s, and every crate dropped on a shape comes to rest on its top', async () => {
  const { child, w } = await booted()
  expect(modsOf(w.world, 'box3d', 'fixed')).toEqual([fixed])
  const drops = [[4, 1, 4, 0], [0, 2, 6, 1], [8, 4, 0, 3]].map(([x, y, z, top]) => ({ crate: child.spawn('crate', { pos: [x, y, z] }), top }))
  run(child, 240)
  for (const { crate, top } of drops) {
    expect(crate.data.awake).toBe(false)
    expect(Math.abs(crate.data.pos[1] - (top + 0.25))).toBeLessThan(0.01)
  }
})

test('a ray down meets each shape at its top, named by its row; across the post, it meets the prism solids draws, a flat side at its radius facing x and a corner further out', async () => {
  const { w, row } = await booted()
  const block = castRayClosest(w, [0, 10, 6], [0, -20, 0])!
  expect(block.id).toBe(row('block').id)
  expect(block.point[1]).toBeCloseTo(1, 4)
  // 0.9 m across the block from its middle is within its 2 m across, turned by TURN; 0.9 m along its
  // 1 m length is past it, onto the floor.
  expect(castRayClosest(w, [0.9 * Math.cos(TURN), 10, 6 - 0.9 * Math.sin(TURN)], [0, -20, 0])!.id).toBe(row('block').id)
  expect(castRayClosest(w, [0.9 * Math.sin(TURN), 10, 6 + 0.9 * Math.cos(TURN)], [0, -20, 0])!.id).toBe(row('floor').id)
  const flat = castRayClosest(w, [12, 1, 0], [-8, 0, 0])!
  expect(flat.id).toBe(row('post').id)
  expect(flat.point[0]).toBeCloseTo(8 + RADIUS, 4)
  const a = Math.PI / SIDES, corner = castRayClosest(w, [8 + 4 * Math.cos(a), 1, 4 * Math.sin(a)], [-8 * Math.cos(a), 0, -8 * Math.sin(a)])!
  expect(Math.hypot(corner.point[0] - 8, corner.point[2])).toBeCloseTo(RADIUS / Math.cos(a), 4)
})

test('a ramp is the slab solids draws, its surface where shapes3d\'s top says; a crate stays on a grippy one and slides off one of no friction', async () => {
  const { child, w, row } = await booted()
  // 1 m up its length from its middle, its surface is 1 + 0.25 m up.
  const hit = castRayClosest(w, [-8, 5, -7], [0, -10, 0])!
  expect(hit.id).toBe(row('grippy').id)
  expect(hit.point[1]).toBeCloseTo(1.25, 4)
  const held = child.spawn('crate', { pos: [-8, 1.3, -8] }), slid = child.spawn('crate', { pos: [-4, 1.3, -8] })
  run(child, 180)
  expect(Math.abs(held.data.pos[2] + 8)).toBeLessThan(0.2)
  expect(slid.data.pos[2]).toBeLessThan(-10)
})

test('a joint may end at a shape: a crate on a rope from the beam hangs under it', async () => {
  const { child, row } = await booted()
  const crate = child.spawn('crate', { pos: [-8, 4, 8] })
  // The beam's body is its middle, 0.25 m over its underside, where the rope is tied.
  child.spawn('rope', { a: row('beam').id, b: crate.id, localFrameA: { pos: [0, -0.25, 0], rot: [0, 0, 0, 1] } })
  run(child, 120)
  expect(Math.hypot(crate.data.pos[0] + 8, crate.data.pos[1] - 6, crate.data.pos[2] - 8)).toBeCloseTo(2, 1)
  expect(crate.data.pos[1]).toBeCloseTo(4, 1)
})
