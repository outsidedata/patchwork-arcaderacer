// The browser side. A frame takes the packets, then ticks the plugins, then each row's actor with
// that row, then the plugins' afterTick, so an actor always draws the row the frame just took.
// An actor is `<kind>.client.ts` in the page's folder, imported once a kind, and `frame()` calls the
// setup, tick and remove of each row's own copy of it.
//
// The first test writes its scene here: two `faller` rows falling at different rates, and the
// faller's actor, written into a folder of its own, which is the page's folder the client loads it
// from. The engine takes packets from whatever pipe a plugin has mounted and does not care how it
// works, so the test's pipe is its own: every step's packet is handed to the scenemanager plugin,
// and every message it sends goes straight into the truth's inbox.
import { afterAll, expect, test, vi } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join as path } from 'node:path'
import { pathToFileURL } from 'node:url'
import { boot, type Msg, type Scene, type Sim } from './engine.ts'
import { client, mixing, steps, type Wire } from './browser.ts'

const DT = 1 / 60
const scene: Scene = {
  world: {},
  plugins: ['scenemanager', 'render3d'],
  seats: 1,
  prefabs: { engine: { dt: DT }, faller: { y: 300, vy: 0, g: 900 } },
  actors: [{ is: 'faller' }, { is: 'faller', g: 450 }],
}
const sim: Sim = {
  faller: { tick(me, dt) { me.data.vy -= me.data.g * dt; me.data.y += me.data.vy * dt } },
}

// The faller's actor draws a box at its row's y plus 10, and tags the box with the row's id.
const home = mkdtempSync(path(tmpdir(), 'browser-'))
writeFileSync(path(home, 'faller.client.ts'), `
let mesh
export function setup(row, plugins) {
  const { THREE, scene } = plugins.render3d
  mesh = new THREE.Mesh(new THREE.BoxGeometry(20, 20, 1), new THREE.MeshBasicMaterial())
  mesh.userData.row = row.id
  scene.add(mesh)
}
export function tick(row) { mesh.position.set(0, row.data.y + 10, 0) }
export function remove(plugins) { plugins.render3d.scene.remove(mesh) }
`)
afterAll(() => rmSync(home, { recursive: true }))

test('each actor draws the row of the packet taken in the same frame', async () => {
  const truth = boot(scene, sim)
  const me = await client(scene, pathToFileURL(home + '/').href)
  const seat = truth.open()
  me.plugins.scenemanager.mount({ send: (up: { msg: Msg }) => truth.inbox(seat, up.msg), hear() {}, close() {}, store: {} }, 'fall', seat)
  truth.onStep(() => me.plugins.scenemanager.hand(truth.packet(seat)))
  const stage = me.plugins.render3d.scene
  let drawn = 0, off = 0
  for (let f = 0; f < 200; f++) {
    await me.frame()
    for (const r of me.rows.filter(r => r.kind === 'faller')) {
      const mesh = stage.children.find((m: any) => m.userData.row === r.id)
      off = Math.max(off, Math.abs(mesh.position.y - 10 - r.data.y))
      drawn++
    }
    truth.step(DT)
  }
  // The first frame comes before the first step, so it takes no packet; every frame after it
  // draws both fallers.
  expect(drawn).toBe(2 * 199)
  expect(off).toBe(0)
  // The two fall at different rates, so a box drawn from the other's row would be off.
  const [a, b] = me.rows.filter(r => r.kind === 'faller')
  expect(a.data.y).not.toBe(b.data.y)
  me.close()
})

// A row's look is imported only when its kind is one the client found with a look as it started: a
// look written into the folder after that is never asked for, and a page over http reads which kinds
// have one from `looks.json` beside it, once.
test('a kind with no look when the client starts is never asked for its look', async () => {
  const dusty: Scene = { ...scene, prefabs: { ...scene.prefabs, dust: {} } }
  const truth = boot(dusty, { ...sim, dust: {} })
  const me = await client(dusty, pathToFileURL(home + '/').href)
  writeFileSync(path(home, 'dust.client.ts'), 'export function setup() {}\nexport function tick() {}\nexport function remove() {}\n')
  const seat = truth.open()
  me.plugins.scenemanager.mount({ send: (up: { msg: Msg }) => truth.inbox(seat, up.msg), hear() {}, close() {}, store: {} }, 'fall', seat)
  truth.onStep(() => me.plugins.scenemanager.hand(truth.packet(seat)))
  truth.spawn('dust', {})
  truth.step(DT)
  await me.frame()
  const dust = me.rows.find(r => r.kind === 'dust')!
  expect(me.actor(dust.id)).toBeUndefined()
  expect(me.rows.filter(r => r.kind === 'faller').every(r => me.actor(r.id))).toBe(true)
  me.close()
  rmSync(path(home, 'dust.client.ts'))
})

test('a page over http reads the kinds with a look from looks.json beside it', async () => {
  const asked: string[] = []
  vi.stubGlobal('fetch', async (url: URL) => { asked.push(url.href); return new Response('[]') })
  const me = await client(scene, 'http://looks.test/games/fall/index.html')
  vi.unstubAllGlobals()
  expect(asked).toEqual(['http://looks.test/games/fall/looks.json'])
  me.close()
})

// A page built into a bundle hands over every module it holds by the url each is loaded by
// (`scripts/bundle.ts`): the client reads the kinds with a look off it and takes each row's copy from
// the drawing file it holds, asking the network for neither.
test('a page that is a bundle takes its looks from the bundle, a copy of its own for each row', async () => {
  const made: number[] = []
  const BUNDLE = Symbol.for('core.bundle')
  ;(globalThis as Record<symbol, unknown>)[BUNDLE] = {
    '/games/fall/faller.client.ts?instance': {
      async instance() {
        let id = 0
        return { setup(row: { id: number }) { id = row.id; made.push(id) }, tick() {}, remove() { made.splice(made.indexOf(id), 1) } }
      },
    },
  }
  vi.stubGlobal('fetch', async () => { throw new Error('a bundle asks for nothing') })
  const truth = boot(scene, sim)
  const me = await client(scene, 'http://bundle.test/games/fall/index.html')
  const seat = truth.open()
  me.plugins.scenemanager.mount({ send: (up: { msg: Msg }) => truth.inbox(seat, up.msg), hear() {}, close() {}, store: {} }, 'fall', seat)
  truth.onStep(() => me.plugins.scenemanager.hand(truth.packet(seat)))
  truth.step(DT)
  await me.frame()
  vi.unstubAllGlobals()
  delete (globalThis as Record<symbol, unknown>)[BUNDLE]
  const ids = me.rows.filter(r => r.kind === 'faller').map(r => r.id)
  expect(made).toEqual(ids)
  expect(me.actor(ids[0])).not.toBe(me.actor(ids[1]))
  me.close()
  expect(made).toEqual([])
})

// Input before the steps: `input` runs each plugin's `input`, handed `plugins`, once the client has
// taken its first packet and until it closes. A plugin here is given one by hand, which writes down
// the step of the packet the client last took each time it runs.
test('input runs every plugin\'s input from the first packet until the client closes', async () => {
  const truth = boot(scene, sim)
  const me = await client(scene, pathToFileURL(home + '/').href)
  const seat = truth.open()
  me.plugins.scenemanager.mount({ send: (up: { msg: Msg }) => truth.inbox(seat, up.msg), hear() {}, close() {}, store: {} }, 'fall', seat)
  truth.onStep(() => me.plugins.scenemanager.hand(truth.packet(seat)))
  const ran: number[] = []
  me.plugins.render3d.input = (p: { wire: Wire }) => { ran.push(p.wire.n) }
  await me.frame()
  me.input()
  expect(ran).toEqual([])
  truth.step(DT)
  await me.frame()
  me.input()
  truth.step(DT)
  await me.frame()
  me.input()
  expect(ran).toEqual([me.n - 1, me.n])
  me.close()
  me.input()
  expect(ran).toHaveLength(2)
})

// Drawing between steps, on things of one number each: `x`, set as an actor sets a thing from its
// row, and a wire saying the step the client took and how far past it the clock is.
type Thing = { x: number }
const wire = (n: number, between?: number) => ({ n, between }) as Wire
const placed = () => steps<Thing>(t => [t.x], (t, p) => { t.x = p[0] }, mixing())

test('a thing is drawn a step behind the clock, between where its last two steps set it, and put back once drawn', () => {
  const s = placed()
  const a = { x: 10 }, still = { x: 5 }
  s.place([a, still], wire(1, 0.5))
  s.restore()
  a.x = 20
  // Step 2 taken, the clock a quarter of a step past it: a quarter of the way from step 1's 10.
  s.place([a, still], wire(2, 0.25))
  expect([a.x, still.x]).toEqual([12.5, 5])
  s.restore()
  expect(a.x).toBe(20)
  // A frame that took no step, the clock three quarters past it.
  s.place([a, still], wire(2, 0.75))
  expect(a.x).toBe(17.5)
  s.restore()
  // Two steps on one frame, to step 4's 40: a step behind the clock is 3.5, three quarters of the
  // way from step 2 to step 4.
  a.x = 40
  s.place([a, still], wire(4, 0.5))
  expect(a.x).toBe(35)
  s.restore()
  expect(a.x).toBe(40)
})

test('with no between, a thing new on the newest step, or the steps gone back, a thing is drawn where it is set', () => {
  const s = placed()
  const a = { x: 0 }
  s.place([a], wire(1, 0.5))
  s.restore()
  a.x = 10
  s.place([a], wire(2))
  expect(a.x).toBe(10)
  s.restore()
  const late = { x: 7 }
  a.x = 20
  s.place([a, late], wire(3, 0.5))
  expect([a.x, late.x]).toEqual([15, 7])
  s.restore()
  a.x = 0
  s.place([a, late], wire(1, 0.5))
  expect(a.x).toBe(0)
  s.restore()
})

test('a thing the page moves on a frame of no step is drawn where it is set, until a whole step goes by with only the steps moving it', () => {
  const s = placed()
  const page = { x: 0 }
  s.place([page], wire(1, 0.5))
  s.restore()
  page.x = 10
  s.place([page], wire(2, 0.5))
  expect(page.x).toBe(5)
  s.restore()
  // Moved by the page between steps: drawn where it is set, this step and the next.
  page.x = 11
  s.place([page], wire(2, 0.9))
  expect(page.x).toBe(11)
  s.restore()
  page.x = 20
  s.place([page], wire(3, 0.5))
  expect(page.x).toBe(20)
  s.restore()
  // A whole step with nothing but the steps moving it: between them again.
  page.x = 30
  s.place([page], wire(4, 0.5))
  expect(page.x).toBe(25)
  s.restore()
})

test('mixing takes an angle the short way round, and every other number in a straight line', () => {
  const [x, turn] = mixing([1])([0, 2 * Math.PI - 0.1], [10, 0.1], 0.5)
  expect(x).toBe(5)
  expect(turn).toBeCloseTo(2 * Math.PI, 12)
})
