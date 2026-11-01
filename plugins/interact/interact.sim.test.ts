// interact's server half on a scene the test writes into a game folder of its own and boots through
// the scenemanager's `load`, so the scene's mod is loaded as a game's is. The machine is a `cart` row,
// a kind with no rule, whose points the game's own `rack` plugin hands interact through
// `plugins/rack/rack.interact.ts` (named in `world.shipped.plugins`): each point a place offset from
// the cart's `pos` along x and z turned by its `yaw`, facing the cart's yaw. The body is a `person` row
// anim draws by a rig the test writes: `reach` 1 s long, `step` 2 s, `perch` a loop. The cart's
// interaction `board`: `reach` at `foot` turned 90°, `step` at `edge`, and `perch` at
// `seat`, holding; `hop` has `reach` alone and so ends. A `probe` row hands the test the truth's `w`.
//
// Begun, the body stands at the first step's point facing its yaw turned, its first clip played; it
// steps on as each clip runs its length, the time past the end carried; through a step it stands on
// the step's point and nowhere else; it holds the last step that holds and follows the cart as it moves; an
// interaction whose last step does not hold ends, its act stopped; a cart that ends ends it; `end`
// ends it where it is; and what throws.
import { afterAll, expect, test } from 'vitest'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { boot, type Row, type Scene, type Truth, type W } from '#engine/engine.ts'
import { load } from '#addons/scenemanager/scenemanager.addon.ts'
import { scenemanager } from '#plugins/scenemanager/scenemanager.sim.ts'
import { written } from '#plugins/loader/loader.sim.ts'
import { advance, begin, check, end, interactionOf, placeOf, startOf, stepOf, type Interaction } from './interact.sim.ts'

const DT = 1 / 60
const measure = (dur: number) => ({ dur, forward: 0, left: 0, yaw: 0, travel: [[0, 0, 0, 0], [dur, 0, 0, 0]] })
// `enter` walks 2 m ahead and 0.5 m left over 2 s, turning 90° left, its curve bent at 1 s; `slip` goes
// 1.5 m ahead and 0.4 m right turning 20° right, under `turns`, so its turn is not kept, played at
// `scale` 2.
const ENTER = { dur: 2, forward: 2, left: 0.5, yaw: 90, travel: [[0, 0, 0, 0], [1, 1.2, 0.1, 30], [2, 2, 0.5, 90]] }
const SLIP = { dur: 1.5, forward: 1.5, left: -0.4, yaw: -20, travel: [[0, 0, 0, 0], [1.5, 1.5, -0.4, -20]] }
const RIG = {
  clips: { idle: { loop: true }, reach: {}, step: {}, perch: { loop: true }, enter: {}, slip: { scale: 2 } },
  roles: { still: 'idle' },
  table: { idle: measure(1), reach: measure(1), step: measure(2), perch: measure(3), enter: ENTER, slip: SLIP },
}
const IN: Interaction = {
  body: 'person',
  steps: [
    { name: 'in', clip: 'enter', at: 'seat', turn: -30, travel: 'to' },
    { name: 'perch', clip: 'perch', at: 'seat', hold: true },
  ],
}
const OUT: Interaction = { body: 'person', steps: [{ name: 'out', clip: 'slip', at: 'seat', turn: 40, travel: 'from' }] }
const BOARD: Interaction = {
  body: 'person',
  steps: [
    { name: 'reach', clip: 'reach', at: 'foot', turn: 90 },
    { name: 'step', clip: 'step', at: 'edge' },
    { name: 'perch', clip: 'perch', at: 'seat', hold: true },
  ],
}
const HOP: Interaction = { body: 'person', steps: [{ name: 'reach', clip: 'reach', at: 'foot' }] }
let files = 0
const url = (what: string) => `/interact-sim-test/${++files}.${what}.json`
const RIG_URL = url('rig'), BOARD_URL = url('board'), HOP_URL = url('hop'), IN_URL = url('in'), OUT_URL = url('out')
written(RIG_URL, JSON.stringify(RIG))
written(BOARD_URL, JSON.stringify(BOARD))
written(HOP_URL, JSON.stringify(HOP))
written(IN_URL, JSON.stringify(IN))
written(OUT_URL, JSON.stringify(OUT))

// The rack's points: [x, y, z] in the cart's frame (x its left, z ahead).
const POINTS = { foot: [1, 0, 0], edge: [0, 1, 0], seat: [0, 1.5, -0.5] }

const yard: Scene = {
  world: {
    loader: { assets: { rig: { type: 'json', url: RIG_URL, preload: true }, board: { type: 'json', url: BOARD_URL, preload: true }, hop: { type: 'json', url: HOP_URL, preload: true }, in: { type: 'json', url: IN_URL, preload: true }, out: { type: 'json', url: OUT_URL, preload: true } } },
    anim: { still: 0.05, shift: 0.75, leap: 0.5, landFall: 7.5, moves: 0.05, turns: 30, kinds: { person: { rig: 'rig', model: 'figure', fade: 0.2, reads: { pos: 'pos', yaw: 'yaw', vel: 'vel', grounded: 'grounded', limp: 'limp' } } } },
    interact: { kinds: { cart: { board: 'board', hop: 'hop', in: 'in', out: 'out' } }, mods: { point: 'rack' } },
    shipped: { plugins: ['rack'] },
  },
  prefabs: {
    engine: { dt: DT }, scenemanager: { out: {} }, loader: {},
    person: { pos: [0, 0, 0], yaw: 0, vel: [0, 0, 0], grounded: true, limp: false, interact: null },
    cart: { pos: [0, 0, 0], yaw: 0 },
    probe: {},
  },
  actors: [{ is: 'scenemanager' }, { is: 'loader' }, { is: 'person' }, { is: 'cart', pos: [10, 2, -4], yaw: 0.5 }, { is: 'probe' }],
  plugins: ['scenemanager'],
}
const top: Scene = {
  world: {}, plugins: ['scenemanager'], seats: 1,
  prefabs: { engine: { dt: DT }, scenemanager: { scenes: { yard: { file: 'yard.scene.json', suspend: false } }, dt: DT, entry: 'yard', port: 0 } },
  actors: [{ is: 'scenemanager' }],
}

const dir = mkdtempSync(join(tmpdir(), 'interact-sim-'))
afterAll(() => rmSync(dir, { recursive: true }))
const path = (p: string) => JSON.stringify(new URL(p, import.meta.url).pathname)
mkdirSync(join(dir, 'plugins/rack'), { recursive: true })
writeFileSync(join(dir, 'plugins/rack/rack.plugin.ts'), 'export const rack = () => ({})\n')
writeFileSync(join(dir, 'plugins/rack/rack.interact.ts'), `
const POINTS = ${JSON.stringify(POINTS)}
export function point(w, machine, name) {
  const p = POINTS[name]
  if (!p) return undefined
  const [x, y, z] = machine.data.pos, yaw = machine.data.yaw
  return { at: [x + p[0] * Math.cos(yaw) + p[2] * Math.sin(yaw), y + p[1], z - p[0] * Math.sin(yaw) + p[2] * Math.cos(yaw)], yaw }
}
export function object() { return undefined }
`)
writeFileSync(join(dir, 'yard.scene.json'), JSON.stringify(yard))
writeFileSync(join(dir, 'yard.sim.ts'), `
import { scenemanager } from ${path('../scenemanager/scenemanager.sim.ts')}
import { loader } from ${path('../loader/loader.sim.ts')}
import file from './yard.scene.json' with { type: 'json' }
export const sim = { scenemanager, loader, person: {}, cart: {}, probe: { after(_me, _dt, w) { globalThis.interactW = w } } }
export const scene = file
`)

// The yard booted and stepped once, so the probe has handed over `w`.
async function open() {
  const t: Truth = (await load(boot(structuredClone(top), { scenemanager }), pathToFileURL(dir + '/').href)).get('yard')!
  t.step(DT)
  const w = (globalThis as any).interactW as W
  return { t, w, person: t.rows.find(r => r.kind === 'person')!, cart: t.rows.find(r => r.kind === 'cart')! }
}
// Where the rack puts point `name` of the cart as it stands.
const rackAt = (cart: Row, name: keyof typeof POINTS) => {
  const p = POINTS[name], [x, y, z] = cart.data.pos, yaw = cart.data.yaw
  return [x + p[0] * Math.cos(yaw) + p[2] * Math.sin(yaw), y + p[1], z - p[0] * Math.sin(yaw) + p[2] * Math.cos(yaw)]
}
const close = (a: number[], b: number[]) => a.forEach((v, i) => expect(v).toBeCloseTo(b[i], 9))
const run = (person: Row, w: W, seconds: number) => {
  let last
  for (let i = 0; i < Math.round(seconds / DT); i++) last = advance(person, w, DT)
  return last
}

test('placeOf is the point mod\'s place of a point of the machine, and throws for one it has not', async () => {
  const { w, cart } = await open()
  const p = placeOf(w, cart, 'seat')
  close(p.at, rackAt(cart, 'seat'))
  expect(p.yaw).toBe(0.5)
  expect(() => placeOf(w, cart, 'roof')).toThrow('interact cart: the cart has no point roof')
})

test('begun, the body stands at the first step\'s point facing its yaw turned, its first clip played from 0, still on the ground', async () => {
  const { w, person, cart } = await open()
  begin(person, w, cart, 'board')
  expect(person.data.interact).toEqual({ machine: cart.id, kind: 'cart', name: 'board', step: 0, t: 0 })
  close(person.data.pos, rackAt(cart, 'foot'))
  expect(person.data.yaw).toBeCloseTo(0.5 + Math.PI / 2, 12)
  expect(person.data).toMatchObject({ state: 'act', clip: 'reach', clipT: 0, holds: true, vel: [0, 0, 0], grounded: true })
  expect(stepOf(person, w)).toBe('reach')
})

test('each step lasts its clip, the time past the end carried into the next, whose clip is played from 0; through the step the body stands on its point and nowhere else', async () => {
  const { w, person, cart } = await open()
  begin(person, w, cart, 'board')
  expect(run(person, w, 0.5)).toEqual({ name: 'reach', done: false })
  expect(advance(person, w, 0.6)).toEqual({ name: 'step', done: false })
  expect(person.data.interact.t).toBeCloseTo(0.5 + 0.6 - 1 - (Math.round(0.5 / DT) * DT - 0.5), 9)
  expect(person.data).toMatchObject({ clip: 'step', clipT: 0 })
  const t = person.data.interact.t
  close(person.data.pos, rackAt(cart, 'edge'))
  expect(person.data.yaw).toBeCloseTo(0.5, 12)
  advance(person, w, 1.5 - t)
  close(person.data.pos, rackAt(cart, 'edge'))
  expect(stepOf(person, w)).toBe('step')
})

test('the last step that holds is held for ever, the body following the cart as it moves and turns', async () => {
  const { w, person, cart } = await open()
  begin(person, w, cart, 'board')
  expect(run(person, w, 3.5)).toEqual({ name: 'perch', done: false })
  expect(run(person, w, 60)).toEqual({ name: 'perch', done: false })
  expect(person.data).toMatchObject({ clip: 'perch', state: 'act' })
  cart.data.pos = [20, 5, 3]
  cart.data.yaw = -1.2
  advance(person, w, DT)
  close(person.data.pos, rackAt(cart, 'seat'))
  expect(person.data.yaw).toBeCloseTo(-1.2, 12)
})

test('an interaction whose last step does not hold ends at its end: interact null, the act stopped, done handed back once', async () => {
  const { w, person, cart } = await open()
  begin(person, w, cart, 'hop')
  expect(run(person, w, 0.5)).toEqual({ name: 'reach', done: false })
  expect(advance(person, w, 0.6)).toEqual({ name: 'reach', done: true })
  expect(person.data.interact).toBeNull()
  expect(person.data.state).toBe('loco')
  close(person.data.pos, rackAt(cart, 'foot'))
  expect(advance(person, w, DT)).toBeUndefined()
  expect(stepOf(person, w)).toBeUndefined()
})

test('a cart whose row ends ends the interaction, done; end ends one where it is', async () => {
  const a = await open()
  begin(a.person, a.w, a.cart, 'board')
  a.t.end(a.cart)
  expect(advance(a.person, a.w, DT)).toEqual({ name: 'board', done: true })
  expect(a.person.data.interact).toBeNull()
  const b = await open()
  begin(b.person, b.w, b.cart, 'board')
  run(b.person, b.w, 1.5)
  end(b.person, b.w)
  expect(b.person.data.interact).toBeNull()
  expect(b.person.data.state).toBe('loco')
})

// A move of `fwd` ahead and `left` to the left of a facing `yaw` from `from`, as anim moves a body: yaw θ
// faces (sin θ, cos θ), and left of it is (cos θ, −sin θ).
const ahead = (from: number[], yaw: number, fwd: number, left: number) =>
  [from[0] + fwd * Math.sin(yaw) + left * Math.cos(yaw), from[1], from[2] + fwd * Math.cos(yaw) - left * Math.sin(yaw)]
const DEG = Math.PI / 180

test('a step that travels "to" its point walks the body along its clip\'s curve from where it starts to the point, facing the point\'s yaw turned by `turn` at its end', async () => {
  const { w, person, cart } = await open()
  // Starting where the curve, ending at the seat facing 0.5 − 30°, puts the body: turned back by the
  // curve's whole turn, and back along its whole move in that facing.
  const facing = 0.5 - 30 * DEG - 90 * DEG
  const start = ahead(rackAt(cart, 'seat'), facing, -2, -0.5)
  const s = startOf(w, person, cart, 'in')
  close(s.at, start)
  expect(s.yaw).toBeCloseTo(facing, 12)
  begin(person, w, cart, 'in')
  close(person.data.pos, start)
  expect(person.data.yaw).toBeCloseTo(facing, 12)
  // Half a second in: a quarter of the way along the curve's first row, turned 7.5°.
  run(person, w, 0.5)
  const t = person.data.interact.t
  close(person.data.pos, ahead(start, facing, 1.2 * t, 0.1 * t))
  expect(person.data.yaw).toBeCloseTo(facing + 30 * t * DEG, 9)
  // On the step's last step, at the seat, facing as it was turned; then the next step, on the seat.
  advance(person, w, 2 - DT - t)
  expect(stepOf(person, w)).toBe('in')
  const u = person.data.interact.t
  close(person.data.pos, ahead(start, facing, 2 - 0.8 * (2 - u), 0.5 - 0.4 * (2 - u)))
  expect(advance(person, w, 2 * DT)).toEqual({ name: 'perch', done: false })
  close(person.data.pos, rackAt(cart, 'seat'))
  expect(person.data.yaw).toBeCloseTo(0.5, 12)
})

test('a step that travels "from" its point starts there facing its turn and goes where its clip takes it, the clip\'s scale on its move and its turn under `turns` not kept; ending, the body is left there', async () => {
  const { w, person, cart } = await open()
  const facing = 0.5 + 40 * DEG
  const s = startOf(w, person, cart, 'out')
  close(s.at, rackAt(cart, 'seat'))
  expect(s.yaw).toBeCloseTo(facing, 12)
  begin(person, w, cart, 'out')
  run(person, w, 0.75)
  const t = person.data.interact.t
  close(person.data.pos, ahead(rackAt(cart, 'seat'), facing, 2 * 1.5 * (t / 1.5), 2 * -0.4 * (t / 1.5)))
  expect(person.data.yaw).toBeCloseTo(facing, 12)
  expect(advance(person, w, 1)).toEqual({ name: 'out', done: true })
  expect(person.data.interact).toBeNull()
  close(person.data.pos, ahead(rackAt(cart, 'seat'), facing, 3, -0.8))
  expect(person.data.yaw).toBeCloseTo(facing, 12)
})

test('a travelling step is in the point\'s frame: the machine moving and turning mid-step takes the body with it, as far along the curve as it was', async () => {
  const { w, person, cart } = await open()
  begin(person, w, cart, 'out')
  run(person, w, 0.5)
  cart.data.pos = [-3, 1, 7]
  cart.data.yaw = 2.1
  advance(person, w, DT)
  const t = person.data.interact.t
  const facing = 2.1 + 40 * DEG
  close(person.data.pos, ahead(rackAt(cart, 'seat'), facing, 2 * t, 2 * -0.4 * (t / 1.5)))
  expect(person.data.yaw).toBeCloseTo(facing, 12)
})

test('what throws: an interaction the cart has not, a point the cart has not, a scene with no point mod, a clip the rig has no length for, and a file out of shape', async () => {
  const { w, person, cart } = await open()
  expect(() => begin(person, w, cart, 'drive')).toThrow('interact: a cart has no interaction drive')
  expect(interactionOf(w, 'cart', 'drive')).toBeUndefined()
  const bad = (f: unknown) => () => check(f as Interaction, 'x')
  expect(bad({ steps: BOARD.steps })).toThrow('x.body is not an anim kind\'s name')
  expect(bad({ body: 'person', steps: [] })).toThrow('x.steps is not a list of steps')
  expect(bad({ body: 'person', steps: [{ ...BOARD.steps[0], name: '' }] })).toThrow('x.steps[0].name is not a word')
  expect(bad({ body: 'person', steps: [BOARD.steps[0], BOARD.steps[0]] })).toThrow('x.steps[1].name reach is the name of an earlier step')
  expect(bad({ body: 'person', steps: [{ ...BOARD.steps[0], clip: 3 }] })).toThrow('x.steps[0].clip is not a clip\'s name')
  expect(bad({ body: 'person', steps: [{ ...BOARD.steps[0], at: '' }] })).toThrow('x.steps[0].at is not a point\'s name')
  expect(bad({ body: 'person', steps: [{ ...BOARD.steps[0], turn: 'left' }] })).toThrow('x.steps[0].turn is not a number of degrees')
  expect(bad({ body: 'person', steps: [{ ...BOARD.steps[0], hold: 1 }] })).toThrow('x.steps[0].hold is not true or false')
  expect(bad({ body: 'person', steps: [{ ...BOARD.steps[0], hold: true }, BOARD.steps[1]] })).toThrow('x.steps[0] holds, and only the last step may')
  expect(bad({ body: 'person', steps: [{ ...BOARD.steps[0], travel: 'into' }] })).toThrow('x.steps[0].travel is not "from" or "to"')
  expect(bad({ body: 'person', steps: [{ ...BOARD.steps[0], hold: true, travel: 'to' }] })).toThrow('x.steps[0] holds and travels, and a step that holds travels nowhere')
  expect(() => startOf(w, person, cart, 'drive')).toThrow('interact: a cart has no interaction drive')
  expect(bad({ body: 'person', steps: [{ ...BOARD.steps[0], ik: [{ bones: ['a', 'b'], target: 'grip', pole: [1, 0, 0] }] }] })).toThrow('x.steps[0].ik[0].bones is not three bones\' names')
  expect(bad({ body: 'person', steps: [{ ...BOARD.steps[0], ik: [{ bones: ['a', 'b', 'c'], target: '', pole: [1, 0, 0] }] }] })).toThrow('x.steps[0].ik[0].target is not a point\'s name')
  expect(bad({ body: 'person', steps: [{ ...BOARD.steps[0], ik: [{ bones: ['a', 'b', 'c'], target: 'grip', pole: [0, 0, 0] }] }] })).toThrow('x.steps[0].ik[0].pole is not a direction')
  written(HOP_URL, JSON.stringify({ body: 'person', steps: [{ name: 'reach', clip: 'reach', at: 'nowhere' }] }))
  try {
    expect(() => begin(person, w, cart, 'hop')).toThrow('interact cart.hop.steps[0]: the cart has no point nowhere')
    written(HOP_URL, JSON.stringify({ body: 'person', steps: [{ name: 'reach', clip: 'leap', at: 'foot' }] }))
    begin(person, w, cart, 'hop')
    expect(() => advance(person, w, DT)).toThrow('interact: the rig of person has no clip leap in its table')
  } finally {
    written(HOP_URL, JSON.stringify(HOP))
  }
  const mods = (w.world.interact as any).mods
  delete (w.world.interact as any).mods
  try {
    expect(() => begin(person, w, cart, 'board')).toThrow('interact places bodies at the points a mod hands it, and the scene names none in world.interact.mods.point')
  } finally {
    ;(w.world.interact as any).mods = mods
  }
})
