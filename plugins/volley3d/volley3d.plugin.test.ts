// volley3d's browser half on a yard the test writes: a manager and one child, `yard`, which `load`
// boots and a page views through the loopback, as `index.html` makes one, with the packets held four
// steps' time on the way down and the messages sent up at once, on a clock the test moves a step a
// frame. render3d is handed a canvas stand-in and no renderer, so nothing is drawn, and particle3d,
// listed after volley3d, runs the page's effects. `world.volley3d.mods` hands volley3d hitscan3d's
// `shoot` and `bodies`, and hitscan3d meets terrain3d's ground, level at 0, and walker's bodies: a
// dummy, a metre round and four tall, stands in front of one tube. Five `tube` rows each hold a
// pattern, a muzzle and an aim, and each one's `pull(n)` act fires that round on the server with
// `from` its id and `n` the count it is handed, as a launcher's rule does on its press; a tube with a
// `target` fires at that body. `volleys()` is read against `flight`, the ledger row's entries and
// particle3d's effects, and the order of the plugins is checked.
import { afterAll, expect, test, vi } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { boot, type Row, type Scene } from '#engine/engine.ts'
import { accept, link, load, manager, view } from '#addons/scenemanager/scenemanager.addon.ts'
import { loopback, type Time } from '#addons/loopback/loopback.addon.ts'
import { scenemanager } from '#plugins/scenemanager/scenemanager.sim.ts'
import { written } from '#plugins/loader/loader.sim.ts'
import type { Field } from '#plugins/terrain3d/terrain3d.sim.ts'
import type { Numbers as Walker } from '#plugins/walker/walker.sim.ts'
import type { Effect, Effects } from '#plugins/particle3d/particle3d.plugin.ts'
import { flight } from './volley3d.sim.ts'
import { volley3d as page } from './volley3d.plugin.ts'

const DT = 1 / 60
const P = DT * 1000
const LAG = 4

const field: Field = {
  program: { world: 600, hscale: 10, sea: 0.5, flood: false, out: 'level', nodes: [{ id: 'level', op: 'const', value: 0 }] },
  analysis: { slopeStep: 1.5, curveStep: 4, positionRadius: 18, occlusionRadius: 30, occlusionSteps: 5, cliffProbe: 12, cliffSlope: 0.5, cliffDrop: 7, flatAngle: 0.03, records: 50000 },
  ground: { layers: [{ name: 'grass', map: 'grass', scale: 30 }] },
  surfaces: {},
  layers: [],
}
const rocket = { speed: 30, life: 3, look: { body: 'flame', trail: 'smoke', burst: 'boom' } }
const seeker = { ...rocket, seek: 2 }
const effects: Effects = {
  cap: 400,
  effects: {
    flame: [{ lasts: true, follow: true }],
    smoke: [{ every: 0.05, life: [0.5, 0.5] }],
    boom: [{ n: [6, 6], life: [2, 2], speed: [1, 1] }],
  },
}
const urls = { land: '/volley3d-plugin-test/yard.json', patterns: '/volley3d-plugin-test/patterns.json', effects: '/volley3d-plugin-test/effects.json' }
written(urls.land, JSON.stringify(field))
written(urls.patterns, JSON.stringify({ patterns: { rocket, seeker } }))
written(urls.effects, JSON.stringify(effects))

const DUMMY: Walker = {
  radius: 1, height: 4, accel: 14, turnRate: 12, gravity: 20, jumpH: 0.9,
  step: 0.6, maxSlope: 0.7, slopeBand: 0.05, slide: 2, wade: 0.5, span: 0.5, probe: 1.5, seekSpeed: 1.5,
}

const top: Scene = {
  world: {},
  plugins: ['scenemanager'],
  seats: 1,
  prefabs: { engine: { dt: DT }, scenemanager: { scenes: { yard: { file: 'yard.scene.json', suspend: false } }, dt: DT, entry: 'yard', port: 0 } },
  actors: [{ is: 'scenemanager' }],
}
const yard: Scene = {
  world: {
    loader: {
      assets: {
        land: { type: 'json', url: urls.land, preload: true },
        patterns: { type: 'json', url: urls.patterns, preload: true },
        effects: { type: 'json', url: urls.effects, preload: true },
      },
    },
    terrain3d: { field: 'land' },
    walker: { kinds: { dummy: DUMMY } },
    hitscan3d: { mods: { ground: 'terrain3d', bodies: 'walker' }, kinds: { dummy: { parts: { legs: [0, 0.5], chest: [0.5, 1] } } }, rewind: 1 },
    volley3d: { patterns: 'patterns', hold: 0.25, mods: { shoot: 'hitscan3d', bodies: 'hitscan3d' } },
    particle3d: { effects: 'effects', hold: 0.1 },
  },
  plugins: ['loader', 'scenemanager', 'volley3d', 'particle3d', 'render3d'],
  seats: 1,
  prefabs: {
    engine: { dt: DT, width: 320, height: 180 },
    render3d: { camera: { fov: 60, near: 0.1, far: 1000, at: [0, 10, -20], look: [0, 0, 10] } },
    scenemanager: { out: {} }, loader: {}, volley3d: { next: 1, live: [] },
    tube: { name: '', pattern: 'rocket', muzzle: [0, 0, 0], aim: [0, 0, 1], target: 0, landed: [] },
    dummy: { pos: [0, 0, 0] },
  },
  // `level` fires flat at the dummy's chest, 11 m off; `low` down onto the ground 2.67 m off; `high`
  // straight up; `other` up and away, meeting nothing in its life. `seek` fires a guided round off to
  // one side of the dummy, at it.
  actors: [
    { is: 'scenemanager' }, { is: 'loader' }, { is: 'volley3d' },
    { is: 'tube', name: 'level', muzzle: [0, 3, 0], aim: [0, 0, 1] },
    { is: 'tube', name: 'low', muzzle: [5, 2, 0], aim: [0, -0.6, 0.8] },
    { is: 'tube', name: 'high', muzzle: [-5, 2, 0], aim: [0, 1, 0] },
    { is: 'tube', name: 'other', muzzle: [-10, 2, 0], aim: [0, 0.6, 0.8] },
    { is: 'dummy', pos: [0, 0, 12] },
    { is: 'tube', name: 'seek', pattern: 'seeker', muzzle: [0, 3, 0], aim: [0.3, 0, 1], target: 8 },
  ],
}

const dir = mkdtempSync(join(tmpdir(), 'volley3d-plugin-'))
afterAll(() => rmSync(dir, { recursive: true }))
const path = (p: string) => JSON.stringify(new URL(p, import.meta.url).pathname)
writeFileSync(join(dir, 'yard.scene.json'), JSON.stringify(yard))
writeFileSync(join(dir, 'yard.sim.ts'), `
import { scenemanager } from ${path('../scenemanager/scenemanager.sim.ts')}
import { loader } from ${path('../loader/loader.sim.ts')}
import { volley3d, fire } from ${path('./volley3d.sim.ts')}
import file from './yard.scene.json' with { type: 'json' }
export const sim = {
  scenemanager, loader, volley3d, dummy: {},
  tube: {
    open: ['pull'],
    acts: {
      pull(me, w, _seat, n) { fire(w, me.data.pattern, me.data.muzzle, me.data.aim, { from: me.id, n, skip: [], ...(me.data.target ? { target: me.data.target } : {}) }) },
      landed(me, _w, _seat, ...args) { me.data.landed.push(args) },
    },
  },
}
export const scene = file
`)

// The page's clock and the loopback's are one, in milliseconds, which the test moves.
let now = 0
vi.spyOn(performance, 'now').mockImplementation(() => now)

type Hit = { point: number[]; what: string; id?: number | null }
type Volley = { key: [number, number]; pos: number[]; hit?: Hit }

// The yard booted and a page on it, stepped until the page has its client. `frame(during)` is one
// step of the server and one frame of the page, the clock a step on; `during` runs in the frame
// before the page's plugins tick, as an actor's press would.
async function opened() {
  const home = pathToFileURL(dir + '/').href
  const truth = boot(structuredClone(top), { scenemanager })
  await load(truth, home)
  const due: { at: number; f: () => void }[] = []
  const time: Time = { now: () => now, after: (ms, f) => { due.push({ at: now + ms, f }) } }
  const until = (t: number) => {
    for (;;) {
      due.sort((a, b) => a.at - b.at)
      if (!due.length || due[0].at > t) break
      const { at, f } = due.shift()!
      now = at
      f()
    }
    now = t
  }
  const surface = (s: Scene) => ({ addEventListener: () => {}, removeEventListener: () => {}, style: {} as any, width: s.prefabs.engine.width, height: s.prefabs.engine.height, remove() {} })
  const tab = view(link(loopback(accept(manager(truth)), time, { up: { delay: 0 }, down: { delay: LAG * P }, seed: 1 })), top, home, (me, s) => { me.plugins.render3d.canvas = surface(s) })
  const frame = async (during?: () => void) => {
    const t = now + P
    until(t)
    truth.step(DT)
    until(t)
    during?.()
    await tab.frame()
  }
  for (let i = 0; i < 20 && !tab.client; i++) await frame()
  const client = tab.client!
  expect(client).toBeDefined()
  const tube = (name: string): Row => client.rows.find(r => r.kind === 'tube' && r.data.name === name)!
  const volleys = (): Volley[] => client.plugins.volley3d.volleys()
  return { client, frame, tube, volleys }
}

const close = (got: number[], want: number[], digits = 9) => got.forEach((g, i) => expect(g).toBeCloseTo(want[i], digits))
const effectsOf = (client: { plugins: Record<string, any> }, name: string) => (client.plugins.particle3d.effects as readonly Effect[]).filter(fx => fx.name === name)
const liveOf = (client: { rows: Row[] }) => (client.rows.find(r => r.kind === 'volley3d')?.data.live ?? []) as { from: number; n: number; age: number; hit?: Hit }[]

// ---------------------------------------------------------------- the server's rounds

test('a round the server fires is drawn under its [from, n] key where flight puts it at its entry\'s age, its body and trail on, until its entry leaves the row', async () => {
  const { client, frame, tube, volleys } = await opened()
  const other = tube('other')
  await frame(() => { client.plugins.wire.send(other.id, 'pull', 7) })
  for (let i = 0; i < 20 && !liveOf(client).length; i++) await frame()
  const life = Math.round(rocket.life / DT)
  let flew = 0
  while (liveOf(client).length) {
    const [e] = liveOf(client)
    const got = volleys()
    expect(got).toHaveLength(1)
    expect(got[0].key).toEqual([other.id, 7])
    expect(got[0].hit).toBeUndefined()
    close(got[0].pos, flight(rocket, other.data.muzzle, other.data.aim, Math.min(e.age, rocket.life)))
    if (e.age < rocket.life - 1e-9) {
      flew++
      expect(effectsOf(client, 'flame').filter(fx => fx.life === Infinity)).toHaveLength(1)
      expect(effectsOf(client, 'smoke').filter(fx => fx.life === Infinity)).toHaveLength(1)
    } else expect(effectsOf(client, 'flame').filter(fx => fx.life === Infinity)).toEqual([])
    await frame()
    expect(flew).toBeLessThanOrEqual(life + 1)
  }
  expect(flew).toBeGreaterThan(life - LAG - 2)
  // Gone from the page the frame its entry is gone from the row, and it burst nowhere.
  expect(volleys()).toEqual([])
  expect(effectsOf(client, 'boom')).toEqual([])
})

test('a round that meets something takes the entry\'s hit the frame a packet brings it, stops there and bursts there', async () => {
  const { client, frame, tube, volleys } = await opened()
  const level = tube('level')
  await frame(() => { client.plugins.wire.send(level.id, 'pull', 1) })
  for (let i = 0; i < 200 && !volleys()[0]?.hit; i++) await frame()
  const [e] = liveOf(client)
  expect(e.hit).toBeDefined()
  const [got] = volleys()
  expect(got).toEqual({ key: [level.id, 1], pos: e.hit!.point, hit: e.hit })
  const booms = effectsOf(client, 'boom')
  expect(booms).toHaveLength(1)
  close(booms[0].at as number[], e.hit!.point)
  expect(effectsOf(client, 'flame').filter(fx => fx.life === Infinity)).toEqual([])
  // It stays where it met while its entry is held, and bursts once.
  await frame()
  if (liveOf(client).length) close(volleys()[0].pos, e.hit!.point)
  expect(effectsOf(client, 'boom')).toHaveLength(1)
})

// ---------------------------------------------------------------- the order

test('listed after particle3d, or in a scene with no particle3d, it throws', () => {
  const bare = (order: string[]) => page().afterTick({
    wire: { scene: { plugins: order, world: { volley3d: { patterns: 'patterns', hold: 0.25 } }, prefabs: { engine: { dt: DT } } }, rows: [] },
  } as never)
  expect(() => bare(['loader', 'particle3d', 'volley3d', 'render3d'])).toThrow('volley3d is listed after particle3d, which would draw every round a frame late')
  expect(() => bare(['loader', 'volley3d', 'render3d'])).toThrow('volley3d draws its rounds through particle3d, which this scene does not name')
})
