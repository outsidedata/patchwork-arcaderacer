// The browser half of box2d on scenes this test writes itself: a manager and two children, `pit`,
// whose render2d world has y growing up the screen 32 pixels to Box2D's metre, and `flat`, which
// gives render2d no world, so a point is the canvas's pixels. Each child drops crates onto a ground,
// as a scene file, a sim file and a crate actor in a folder of their own, which is what `load` and a
// page's client import. Each page is a real one on the manager, through the loopback transport. The
// crate actor follows an object of its own for its row unless the row says `shy`, scribbles on that
// object in its tick, and lets it go when the row says `loose` or ends; the test reads each page's
// objects off `globalThis.crates`.
import { afterAll, expect, test } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { boot, type Row, type Scene, type Truth } from '#engine/engine.ts'
import { accept, link, load, manager, scene, view } from '#addons/scenemanager/scenemanager.addon.ts'
import { loopback } from '#addons/loopback/loopback.addon.ts'
import { scenemanager } from '#plugins/scenemanager/scenemanager.sim.ts'

const DT = 1 / 60

const top = (entry: string): Scene => ({
  prefabs: {
    engine: { dt: DT },
    scenemanager: { scenes: { pit: { file: 'pit.scene.json', suspend: false }, flat: { file: 'flat.scene.json', suspend: false } }, dt: DT, entry, port: 0 },
  },
  actors: [{ is: 'scenemanager' }],
  plugins: ['scenemanager'],
  seats: 1,
})

const child = (render2d?: object) => ({
  world: {
    box2d: {
      gravity: [0, -10], subStepCount: 4,
      static: [{ pos: [0, -1], rot: [1, 0], shapes: [{ box: [20, 1] }] }],
      kinds: { crate: { type: 'dynamic', shapes: [{ box: [0.5, 0.5], density: 1 }] } },
    },
    ...(render2d ? { render2d } : {}),
  },
  prefabs: {
    engine: { dt: DT, width: 320, height: 200 },
    scenemanager: { out: {} },
    box2d: {},
    crate: { pos: [0, 3], rot: [1, 0], vel: [0, 0], spin: 0, awake: true, shy: false, loose: false, life: -1 },
  },
  actors: [
    { is: 'scenemanager' }, { is: 'box2d' },
    // Tipped an eighth of a turn and spinning, so it lands on a corner and tips onto a side: its
    // `rot` changes as it falls.
    { is: 'crate', pos: [0, 3], rot: [Math.cos(Math.PI / 4), Math.sin(Math.PI / 4)], spin: 2 },
    { is: 'crate', pos: [3, 5], shy: true },
    { is: 'crate', pos: [-3, 4], life: 30 },
  ],
  plugins: ['scenemanager', ...(render2d ? ['render2d'] : []), 'box2d'],
})

const dir = mkdtempSync(join(tmpdir(), 'box2d-plugin-'))
writeFileSync(join(dir, 'pit.scene.json'), JSON.stringify(child({ ground: [[32, 0], [0, -32]], up: [0, 0], zoom: 1, look: [0, 0], layers: ['bodies'] })))
writeFileSync(join(dir, 'flat.scene.json'), JSON.stringify(child()))
for (const name of ['pit', 'flat']) writeFileSync(join(dir, `${name}.sim.ts`), `
import { scenemanager } from ${JSON.stringify(new URL('../scenemanager/scenemanager.sim.ts', import.meta.url).pathname)}
import { box2d } from ${JSON.stringify(new URL('./box2d.sim.ts', import.meta.url).pathname)}
import file from './${name}.scene.json' with { type: 'json' }
export const sim = {
  scenemanager,
  box2d,
  crate: { tick(me, _dt, w) { if (me.data.life > 0 && --me.data.life === 0) w.end(me) } },
}
export const scene = file
`)
// Two pages import one module for a row both are sent, so the actor keeps its objects per page's
// plugins, never in a top-level variable of its own.
writeFileSync(join(dir, 'crate.client.ts'), `
const crates = (globalThis.crates ??= new WeakMap())
const mine = plugins => { let m = crates.get(plugins); if (!m) crates.set(plugins, m = new Map()); return m }
export function setup(row, plugins) {
  if (row.data.shy) return
  const o = { position: { at: null, set(x, y) { this.at = [x, y] } }, rotation: null, let: false }
  mine(plugins).set(row.id, o)
  plugins.box2d.follow(row.id, o)
}
export function tick(row, plugins) {
  const o = mine(plugins).get(row.id)
  if (!o || o.let) return
  o.position.set(9, 9)
  o.rotation = 9
  if (row.data.loose) { o.let = true; plugins.box2d.drop(row.id) }
}
export function remove(plugins) {
  for (const [id, o] of mine(plugins)) if (!plugins.wire.rows.some(r => r.id === id)) { o.let = true; plugins.box2d.drop(id) }
}
`)
afterAll(() => rmSync(dir, { recursive: true }))

type Crate = { position: { at: number[] | null }; rotation: number | null; let: boolean }
const crates = () => (globalThis as unknown as { crates: WeakMap<object, Map<number, Crate>> }).crates

const start = async (entry = 'pit') => {
  const truth = boot(structuredClone(top(entry)), { scenemanager })
  await load(truth, pathToFileURL(dir + '/').href)
  const page = () => view(link(loopback(accept(manager(truth)))), top(entry), pathToFileURL(dir + '/').href, () => {})
  return { truth, child: scene(manager(truth), entry), page }
}
type Page = ReturnType<Awaited<ReturnType<typeof start>>['page']>
const run = async (truth: Truth, pages: Page[], k: number) => {
  for (let i = 0; i < k; i++) { truth.step(DT); for (const p of pages) await p.frame() }
}
const objects = (p: Page) => crates().get(p.client!.plugins)!
const rowsOf = (p: Page) => p.client!.rows.filter(r => r.kind === 'crate')

test('after every frame a followed object is where render2d puts its row on the world, turned as its x axis goes there, over whatever the actor wrote on it', async () => {
  const { truth, page } = await start()
  const p = page()
  await run(truth, [p], 2)
  const [tipped] = rowsOf(p)
  const seen: number[] = []
  for (let i = 0; i < 90; i++) {
    await run(truth, [p], 1)
    const row = p.client!.rows.find(r => r.id === tipped.id) as Row
    const o = objects(p).get(tipped.id)!
    const [x, y] = row.data.pos, [c, s] = row.data.rot
    expect(o.position.at).toEqual([32 * x, -32 * y + 0])
    expect(o.rotation).toBe(Math.atan2(-32 * s, 32 * c))
    seen.push(o.rotation!)
  }
  // It fell and turned, so the object was turned with it.
  expect(seen[0]).not.toBe(seen[seen.length - 1])
})

test('a scene that gives render2d no world draws a row\'s point as the canvas\'s pixels and its turn as Box2D\'s angle', async () => {
  const { truth, page } = await start('flat')
  const p = page()
  await run(truth, [p], 30)
  const [tipped] = rowsOf(p)
  const row = p.client!.rows.find(r => r.id === tipped.id) as Row
  const o = objects(p).get(tipped.id)!
  expect(o.position.at).toEqual(row.data.pos)
  expect(o.rotation).toBe(Math.atan2(row.data.rot[1], row.data.rot[0]))
})

test('a dropped object is no longer written, and neither is one whose row has ended', async () => {
  const { truth, child, page } = await start()
  const p = page()
  await run(truth, [p], 2)
  const [tipped, , brief] = rowsOf(p)
  const briefObject = objects(p).get(brief.id)!
  // The brief crate's rule ends it at its 30th step, and its actor lets its object go: the object
  // keeps where the last packet that held the row put it.
  let last: number[] | undefined
  for (let i = 0; i < 40; i++) {
    await run(truth, [p], 1)
    const r = p.client!.rows.find(r => r.id === brief.id)
    if (r) last = [32 * r.data.pos[0], -32 * r.data.pos[1] + 0]
  }
  expect(p.client!.rows.some(r => r.id === brief.id)).toBe(false)
  expect(briefObject.let).toBe(true)
  expect(briefObject.position.at).toEqual(last)
  // A rule lifts the tipped crate and lets it loose: its actor scribbles on its object one last time
  // and drops it, and from then on the object keeps that while the row falls.
  const live = child.rows.find(r => r.id === tipped.id)!
  live.data.pos = [0, 6]
  live.data.awake = true
  live.data.loose = true
  await run(truth, [p], 1)
  const o = objects(p).get(tipped.id)!
  expect(o.let).toBe(true)
  await run(truth, [p], 20)
  expect([o.position.at, o.rotation]).toEqual([[9, 9], 9])
})

test('each page\'s client has a table of its own: one page letting an object go leaves another page\'s following', async () => {
  const { truth, child, page } = await start()
  const a = page(), b = page()
  await run(truth, [a, b], 2)
  const [tipped] = rowsOf(a)
  a.client!.plugins.box2d.drop(tipped.id)
  Object.assign(child.rows.find(r => r.id === tipped.id)!.data, { pos: [1, 8], awake: true })
  await run(truth, [a, b], 10)
  expect(objects(a).get(tipped.id)!.position.at).toEqual([9, 9])
  const row = b.client!.rows.find(r => r.id === tipped.id)!
  expect(row.data.pos[1]).toBeGreaterThan(6)
  expect(objects(b).get(tipped.id)!.position.at).toEqual([32 * row.data.pos[0], -32 * row.data.pos[1]])
})
