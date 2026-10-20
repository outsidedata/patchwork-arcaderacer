// The browser half of box3d on a scene this test writes itself: a manager, and one child, `pit`, of
// a ground and crates that box3d's world drops onto it, as a scene file, a sim file and a crate actor
// in a folder of their own, which is what `load` and a page's client import. Each page is a real one
// on the manager, through the loopback transport. The crate actor follows an object of its own for
// its row unless the row says `shy`, scribbles on that object in its tick, and lets it go when the
// row says `loose` or ends; the test reads each page's objects off `globalThis.crates`.
import { afterAll, expect, test } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { boot, type Row, type Scene, type Truth } from '#engine/engine.ts'
import { accept, link, load, manager, scene, view } from '#addons/scenemanager/scenemanager.addon.ts'
import { loopback } from '#addons/loopback/loopback.addon.ts'
import { scenemanager } from '#plugins/scenemanager/scenemanager.sim.ts'
import type { Plugins } from '#engine/browser.ts'
import { box3d } from './box3d.plugin.ts'

const DT = 1 / 60

const top: Scene = {
  prefabs: {
    engine: { dt: DT },
    scenemanager: { scenes: { pit: { file: 'pit.scene.json', suspend: false } }, dt: DT, entry: 'pit', port: 0 },
  },
  actors: [{ is: 'scenemanager' }],
  plugins: ['scenemanager'],
  seats: 1,
}

const surface = { friction: 0.6, restitution: 0, rollingResistance: 0 }
const pit = {
  world: {
    box3d: {
      gravity: [0, -10, 0], subStepCount: 4, contactHertz: 30, contactDampingRatio: 10, contactSpeed: 3,
      restitutionThreshold: 1, maximumLinearSpeed: 400, enableSleep: true, enableContinuous: true,
      static: [{ pos: [0, -1, 0], rot: [0, 0, 0, 1], shapes: [{ box: [20, 1, 20], density: 0, baseMaterial: surface }] }],
      kinds: {
        crate: {
          type: 'dynamic', linearDamping: 0, angularDamping: 0, gravityScale: 1, sleepThreshold: 0.05, isBullet: false,
          shapes: [{ box: [0.5, 0.5, 0.5], density: 1000, baseMaterial: surface }],
        },
      },
    },
  },
  prefabs: {
    engine: { dt: DT },
    scenemanager: { out: {} },
    box3d: {},
    crate: { pos: [0, 3, 0], rot: [0, 0, 0, 1], vel: [0, 0, 0], spin: [0, 0, 0], awake: true, shy: false, loose: false, life: -1 },
  },
  actors: [
    { is: 'scenemanager' }, { is: 'box3d' },
    // Tipped an eighth of a turn about z and spinning, so it lands on an edge and tips onto a face:
    // its `rot` changes as it falls.
    { is: 'crate', pos: [0, 3, 0], rot: [0, 0, Math.sin(Math.PI / 8), Math.cos(Math.PI / 8)], spin: [0, 0, 2] },
    { is: 'crate', pos: [3, 5, 0], shy: true },
    { is: 'crate', pos: [-3, 4, 0], life: 30 },
  ],
  plugins: ['scenemanager', 'box3d'],
}

const dir = mkdtempSync(join(tmpdir(), 'box3d-plugin-'))
writeFileSync(join(dir, 'pit.scene.json'), JSON.stringify(pit))
writeFileSync(join(dir, 'pit.sim.ts'), `
import { scenemanager } from ${JSON.stringify(new URL('../scenemanager/scenemanager.sim.ts', import.meta.url).pathname)}
import { box3d } from ${JSON.stringify(new URL('./box3d.sim.ts', import.meta.url).pathname)}
import file from './pit.scene.json' with { type: 'json' }
export const sim = {
  scenemanager,
  box3d,
  crate: { tick(me, _dt, w) { if (me.data.life > 0 && --me.data.life === 0) w.end(me) } },
}
export const scene = file
`)
// Two pages import one module for a row both are sent, so the actor keeps its objects per page's
// plugins, never in a top-level variable of its own.
writeFileSync(join(dir, 'crate.client.ts'), `
const crates = (globalThis.crates ??= new WeakMap())
const mine = plugins => { let m = crates.get(plugins); if (!m) crates.set(plugins, m = new Map()); return m }
// As three's: \`fromArray\` hands back the object, and a quaternion's \`normalize\` makes it a unit turn.
const part = () => ({ at: null, fromArray(a) { this.at = [...a]; return this }, normalize() { const l = Math.hypot(...this.at); this.at = this.at.map(x => x / l); return this } })
export function setup(row, plugins) {
  if (row.data.shy) return
  const o = { position: part(), quaternion: part(), let: false }
  mine(plugins).set(row.id, o)
  plugins.box3d.follow(row.id, o)
}
export function tick(row, plugins) {
  const o = mine(plugins).get(row.id)
  if (!o || o.let) return
  o.position.fromArray([9, 9, 9])
  o.quaternion.fromArray([9, 9, 9, 9])
  if (row.data.loose) { o.let = true; plugins.box3d.drop(row.id) }
}
export function remove(plugins) {
  for (const [id, o] of mine(plugins)) if (!plugins.wire.rows.some(r => r.id === id)) { o.let = true; plugins.box3d.drop(id) }
}
`)
afterAll(() => rmSync(dir, { recursive: true }))

type Part = { at: number[] | null }
type Crate = { position: Part; quaternion: Part; let: boolean }
const crates = () => (globalThis as unknown as { crates: WeakMap<object, Map<number, Crate>> }).crates

const start = async () => {
  const truth = boot(structuredClone(top), { scenemanager })
  await load(truth, pathToFileURL(dir + '/').href)
  const page = () => view(link(loopback(accept(manager(truth)))), top, pathToFileURL(dir + '/').href, () => {})
  const child = scene(manager(truth), 'pit')
  return { truth, child, page }
}
type Page = ReturnType<Awaited<ReturnType<typeof start>>['page']>
const run = async (truth: Truth, pages: Page[], k: number) => {
  for (let i = 0; i < k; i++) { truth.step(DT); for (const p of pages) await p.frame() }
}
const objects = (p: Page) => crates().get(p.client!.plugins)!
const rowsOf = (p: Page) => p.client!.rows.filter(r => r.kind === 'crate')

test('after every frame a followed object is where its row is, over whatever the actor wrote on it, and a row nobody follows is passed by', async () => {
  const { truth, page } = await start()
  const p = page()
  await run(truth, [p], 2)
  const [tipped, shy, brief] = rowsOf(p)
  expect(shy.data.shy).toBe(true)
  expect([...objects(p).keys()].sort()).toEqual([tipped.id, brief.id].sort())
  const seen: number[][] = []
  for (let i = 0; i < 90; i++) {
    await run(truth, [p], 1)
    const row = p.client!.rows.find(r => r.id === tipped.id) as Row
    const o = objects(p).get(tipped.id)!
    expect(o.position.at).toEqual(row.data.pos)
    // Box3D's turn is a unit turn only to its float32s, and is drawn made one exactly.
    const l = Math.hypot(...row.data.rot)
    expect(o.quaternion.at).toEqual(row.data.rot.map((x: number) => x / l))
    seen.push(row.data.pos, row.data.rot)
  }
  // It fell, and turned, so the object was moved with it and not left where it began.
  expect(seen[0]).not.toEqual(seen[seen.length - 2])
  expect(seen[1]).not.toEqual(seen[seen.length - 1])
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
    last = p.client!.rows.find(r => r.id === brief.id)?.data.pos ?? last
  }
  expect(p.client!.rows.some(r => r.id === brief.id)).toBe(false)
  expect(briefObject.let).toBe(true)
  expect(briefObject.position.at).toEqual(last)
  // A rule lifts the tipped crate and lets it loose: its actor scribbles on its object one last time
  // and drops it, and from then on the object keeps that while the row falls.
  const live = child.rows.find(r => r.id === tipped.id)!
  live.data.pos = [0, 6, 0]
  live.data.loose = true
  await run(truth, [p], 1)
  const o = objects(p).get(tipped.id)!
  expect(o.let).toBe(true)
  const from = p.client!.rows.find(r => r.id === tipped.id)!.data.pos
  await run(truth, [p], 20)
  expect(p.client!.rows.find(r => r.id === tipped.id)!.data.pos[1]).toBeLessThan(from[1] - 0.5)
  expect([o.position.at, o.quaternion.at]).toEqual([[9, 9, 9], [9, 9, 9, 9]])
})

test('each page\'s client has a table of its own: one page letting an object go leaves another page\'s following', async () => {
  const { truth, child, page } = await start()
  const a = page(), b = page()
  await run(truth, [a, b], 2)
  const [tipped] = rowsOf(a)
  // A lets its object of the tipped crate go by hand, so what its actor scribbles stays; B's goes on
  // following, lifted with its row.
  a.client!.plugins.box3d.drop(tipped.id)
  child.rows.find(r => r.id === tipped.id)!.data.pos = [1, 8, 1]
  await run(truth, [a, b], 10)
  expect(objects(a).get(tipped.id)!.position.at).toEqual([9, 9, 9])
  const row = b.client!.rows.find(r => r.id === tipped.id)!
  expect(row.data.pos[1]).toBeGreaterThan(6)
  expect(objects(b).get(tipped.id)!.position.at).toEqual(row.data.pos)
})

// A page that runs ahead hands its view a turn blended number by number while it eases a jump
// (`addons/predict`, Easing a jump), which is no unit turn: the object takes it made one again.
test('a row\'s turn that is not a unit turn is drawn as the unit turn along it', () => {
  const plugin = box3d()
  const at: Record<string, number[]> = {}
  const part = (name: string) => ({
    fromArray(a: number[]) { at[name] = [...a]; return { normalize: () => { const l = Math.hypot(...at[name]); at[name] = at[name].map(x => x / l) } } },
  })
  plugin.follow(4, { position: part('pos'), quaternion: part('rot') })
  plugin.afterTick({ wire: { rows: [{ id: 4, kind: 'crate', data: { pos: [1, 2, 3], rot: [0, 0.6, 0, 1.6] } }] } } as unknown as Plugins)
  expect(at.pos).toEqual([1, 2, 3])
  const l = Math.hypot(0.6, 1.6)
  expect(at.rot).toEqual([0, 0.6 / l, 0, 1.6 / l])
})
