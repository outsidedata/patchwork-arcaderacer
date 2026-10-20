// box3d's Box3D world. The test writes its own scenes: `world.box3d` is a static ground whose top is
// y = 0 and the body kinds `crate` (a box), `pebble` and `stone` (spheres, the stone three times as
// dense), `rod` (a capsule) and `lift` (a kinematic box), with `note`, a kind with the same fields
// that box3d does not list; a test adds the kinds and joints it needs over that. A write the test
// makes to a row between steps is what an act would write.
//
// Every number a test holds a feature to is worked out apart from Box3D: a fall's speed from
// √(2gh), a body's mass from its shape's volume, a push's change of speed from J/m, a pendulum's
// period and a spring's sag from their formulas, a ray's hit from where the thing it meets stands.
import { afterAll, expect, test } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, relative } from 'node:path'
import { boot, type Row, type Scene, type Sim, type Truth, type W } from '#engine/engine.ts'
import { jsonAt, loader, written } from '#plugins/loader/loader.sim.ts'
import { load } from '#addons/scenemanager/scenemanager.addon.ts'
import { scenemanager } from '#plugins/scenemanager/scenemanager.sim.ts'
import { heightAt, type Field } from '#plugins/terrain3d/terrain3d.sim.ts'
import { dial, serve } from '#addons/socket/socket.addon.ts'
import { pathToFileURL } from 'node:url'
import {
  b3, box3d, castMover, castRay, castRayClosest, castShape, clipVector, collideMover, contacts, counters,
  massOf, outline, overlapAABB, overlapShape, pointVelocity, solvePlanes, staticAt,
  type Body, type Geometry, type Joint, type Shape, type Static, type World,
} from './box3d.sim.ts'

const DT = 1 / 60
const SLOP = 0.005
const G = 10

const surface = { friction: 0.6, restitution: 0, rollingResistance: 0 }
const body = (shape: Geometry, density = 1000, over: Partial<Body> = {}): Body => ({
  type: 'dynamic', linearDamping: 0, angularDamping: 0, gravityScale: 1, sleepThreshold: 0.05, isBullet: false,
  shapes: [{ ...shape, density, baseMaterial: surface } as Shape],
  ...over,
})
const at = (pos: number[]) => ({ pos, rot: [0, 0, 0, 1], vel: [0, 0, 0], spin: [0, 0, 0], awake: true })
const ground: Static = { pos: [0, -1, 0], rot: [0, 0, 0, 1], shapes: [{ box: [20, 1, 20], density: 0, baseMaterial: surface }] }

const world = (over: Partial<World> = {}): World => ({
  gravity: [0, -G, 0], subStepCount: 4, contactHertz: 30, contactDampingRatio: 10, contactSpeed: 3,
  restitutionThreshold: 1, maximumLinearSpeed: 400, enableSleep: true, enableContinuous: true,
  ...over,
  static: over.static ?? [ground],
  kinds: {
    crate: body({ box: [0.5, 0.5, 0.5] }),
    pebble: body({ sphere: { center: [0, 0, 0], radius: 0.3 } }),
    stone: body({ sphere: { center: [0, 0, 0], radius: 0.3 } }, 3000),
    rod: body({ capsule: { center1: [-0.5, 0, 0], center2: [0.5, 0, 0], radius: 0.25 } }),
    lift: { ...body({ box: [1, 0.25, 1] }), type: 'kinematic' },
    ...over.kinds,
  },
})

// A scene of the kinds above and whatever more the test lists: `prefabs` for its own kinds' rows.
const scene = (actors: Scene['actors'], over?: Partial<World>, prefabs: Record<string, any> = {}): Scene => ({
  world: { box3d: world(over) },
  prefabs: {
    box3d: {},
    crate: at([0, 0.5, 0]), pebble: at([0, 0.3, 0]), stone: at([0, 0.3, 0]), rod: at([0, 0.25, 0]), lift: at([0, 0.25, 0]),
    note: at([0, 5, 0]),
    asker: {},
    ...prefabs,
  },
  actors: [{ is: 'box3d' }, ...actors],
})

// A rule's `w` on a truth, for the queries, which a rule asks with the `w` its hooks are handed: an
// `asker` row, spawned the first time, keeps the `w` its `after` hook is handed on the step it takes,
// which is the truth's own and holds for every step after.
let asked: W | undefined
const asker = { after(_me: Row, _dt: number, w: W) { asked = w } }
function wOf(truth: Truth): W {
  asked = undefined
  if (!of(truth, 'asker').length) truth.spawn('asker')
  truth.step(DT)
  return asked!
}

const kinds = ['crate', 'pebble', 'stone', 'rod', 'lift', 'note']
const simOf = (more: string[] = []): Sim => ({ box3d, asker, ...Object.fromEntries([...kinds, ...more].map(k => [k, {}])) })
const sim = simOf()
const run = (truth: Truth, k: number) => { for (let i = 0; i < k; i++) truth.step(DT) }
const of = (truth: Truth, kind: string) => truth.rows.filter(r => r.kind === kind)
const dist = (a: number[], b: number[]) => Math.hypot(...a.map((c, i) => c - b[i]))
const len = (a: number[]) => Math.hypot(...a)

// Two crates, one on the other, touching the ground and each other.
const stack = () => boot(scene([{ is: 'crate', pos: [0, 0.5, 0] }, { is: 'crate', pos: [0, 1.5, 0] }]), sim)

// ---------------------------------------------------------------- bodies, as before

test('a stack of two crates stands within the slop and sleeps', () => {
  const truth = stack()
  run(truth, 120)
  const [lo, hi] = of(truth, 'crate')
  expect(dist(lo.data.pos, [0, 0.5, 0])).toBeLessThan(SLOP)
  expect(dist(hi.data.pos, [0, 1.5, 0])).toBeLessThan(SLOP)
  expect([lo.data.awake, hi.data.awake]).toEqual([false, false])
  expect(hi.data.vel).toEqual([0, 0, 0])
})

// What the server says, as the page hears it across a real socket (`addons/socket`).
async function across<T>(said: T): Promise<T> {
  const server = await serve<never, T>(0, send => { send(said); return { take() {}, close() {} } })
  const heard = await new Promise<T>(r => { const page = dial<never, T>(`ws://localhost:${server.port}`)(d => { page.close(); r(d) }) })
  await server.close()
  return heard
}

// A page that runs a scene ahead joins a stack still settling. The server saves its truth and box3d
// hands out its world beside it (`hold`), the world as Box3D's own image of bytes, and both cross a
// real socket; the page loads the save into a truth of its own and box3d takes the world (`take`).
// From then on both step alike to the bit, and the server, which only handed its world out, steps
// exactly as a server nobody joined. Without the world, from the rows alone, the page parts from the
// server.
test('a truth loaded from a save, given what box3d held beside it, steps exactly as the server, a stack settling between', async () => {
  const crates = [{ is: 'crate', pos: [0, 0.6, 0] }, { is: 'crate', pos: [0.1, 1.8, 0] }, { is: 'crate', pos: [-0.1, 3, 0.1] }]
  const joined = async (memory: boolean) => {
    const alone = boot(scene(crates), sim)
    const server = boot(scene(crates), sim)
    run(alone, 20)
    run(server, 20)
    const box = server.rows.find(r => r.kind === 'box3d')!
    const sent = await across({ save: server.save(), held: box3d.hold!(box) as { image: Uint8Array } })
    const page = boot(scene(crates), sim)
    page.load(sent.save)
    if (memory) box3d.take!(page.rows.find(r => r.kind === 'box3d')!, sent.held)
    let parted = 0
    for (let i = 0; i < 120; i++) {
      alone.step(DT)
      server.step(DT)
      page.step(DT)
      expect(server.rows).toEqual(alone.rows)
      if (JSON.stringify(page.rows) !== JSON.stringify(server.rows)) parted++
    }
    return parted
  }
  expect(await joined(true)).toBe(0)
  expect(await joined(false)).toBeGreaterThan(0)
})

test('a box, a sphere and a capsule each come to rest on the ground at its own half height', () => {
  const truth = boot(scene([{ is: 'crate', pos: [-4, 2, 0] }, { is: 'pebble', pos: [0, 2, 0] }, { is: 'rod', pos: [4, 2, 0] }]), sim)
  run(truth, 180)
  const y = (kind: string) => of(truth, kind)[0].data.pos[1]
  expect(Math.abs(y('crate') - 0.5)).toBeLessThan(SLOP)
  expect(Math.abs(y('pebble') - 0.3)).toBeLessThan(SLOP)
  expect(Math.abs(y('rod') - 0.25)).toBeLessThan(SLOP)
  expect(truth.rows.filter(r => r.kind !== 'box3d').every(r => !r.data.awake)).toBe(true)
})

test('a body falls under the world\'s gravity', () => {
  const truth = boot(scene([{ is: 'pebble', pos: [8, 10, 0] }]), sim)
  run(truth, 30)
  const d = of(truth, 'pebble')[0].data
  expect(d.vel[1]).toBeCloseTo(-G * 30 * DT, 3)
  expect([d.pos[0], d.pos[2]]).toEqual([8, 0])
})

test('a velocity a rule writes into a sleeping body, in place, wakes it and moves it', () => {
  const truth = stack()
  run(truth, 120)
  const hi = of(truth, 'crate')[1]
  hi.data.vel[0] = 2
  run(truth, 1)
  expect(hi.data.awake).toBe(true)
  run(truth, 20)
  expect(hi.data.pos[0]).toBeGreaterThan(0.2)
})

test('a sleeping body a rule moves wakes where it was put and falls from there', () => {
  const truth = stack()
  run(truth, 120)
  const hi = of(truth, 'crate')[1]
  hi.data.pos = [3, 2, 0]
  run(truth, 1)
  expect(hi.data.awake).toBe(true)
  expect(hi.data.pos[1]).toBeLessThan(2)
  run(truth, 120)
  expect(dist(hi.data.pos, [3, 0.5, 0])).toBeLessThan(SLOP)
})

test('a rule that writes awake false puts a falling body to sleep where it is', () => {
  const truth = boot(scene([{ is: 'pebble', pos: [5, 4, 0] }]), sim)
  run(truth, 10)
  const p = of(truth, 'pebble')[0]
  p.data.awake = false
  run(truth, 1)
  const hung = [...p.data.pos]
  run(truth, 30)
  expect(p.data.awake).toBe(false)
  expect(p.data.pos).toEqual(hung)
  expect(p.data.vel).toEqual([0, 0, 0])
})

// ---------------------------------------------------------------- sync: only what differs is pushed

test('a row whose pos a rule writes is at that pos on the next step', () => {
  // `mover` writes the pebble's pos once, on step 30, after box3d has stepped: box3d finds the row
  // differing from what it last wrote and moves the body there before the next step.
  const put = [3, 5, 0]
  let n = 0
  const mover = { tick(_me: Row, _dt: number, w: W) { if (++n === 30) Object.assign(w.all('pebble')[0].data, { pos: [...put], vel: [0, 0, 0] }) } }
  const truth = boot(scene([{ is: 'pebble', pos: [0, 0.3, 0] }, { is: 'mover' }], {}, { mover: {} }), { ...sim, mover })
  const p = of(truth, 'pebble')[0]
  run(truth, 30)
  expect(p.data.pos).toEqual(put)
  run(truth, 1)
  expect(dist(p.data.pos, put)).toBeLessThan(0.5)
  expect(p.data.pos[1]).toBeLessThan(put[1])
})

test('a stack of boxes left alone for 200 steps stays asleep: no row changes after the first time it falls asleep', () => {
  const truth = boot(scene([0.5, 1.5, 2.5].map(y => ({ is: 'crate', pos: [0, y, 0] }))), sim)
  const crates = of(truth, 'crate')
  const slept = new Map<number, string>()
  for (let i = 0; i < 200; i++) {
    truth.step(DT)
    for (const c of crates) {
      const now = JSON.stringify(c.data)
      if (slept.has(c.id)) expect(now).toBe(slept.get(c.id))
      else if (!c.data.awake) slept.set(c.id, now)
    }
  }
  expect(slept.size).toBe(crates.length)
})

test('a row spawned of a listed kind is a body from the next step', () => {
  const truth = boot(scene([]), sim)
  run(truth, 5)
  const p = truth.spawn('pebble', { pos: [4, 3, 0] })
  run(truth, 1)
  expect(p.data.pos[1]).toBeLessThan(3)
  expect(p.data.vel[1]).toBeLessThan(0)
})

test('a body whose row ends leaves the world and wakes what it touched', () => {
  const truth = stack()
  run(truth, 120)
  const [lo, hi] = of(truth, 'crate')
  truth.end(lo)
  run(truth, 90)
  expect(dist(hi.data.pos, [0, 0.5, 0])).toBeLessThan(SLOP)
})

test('a kind the table leaves out is never touched', () => {
  const truth = boot(scene([{ is: 'note' }, { is: 'crate', pos: [0, 0.5, 0] }]), sim)
  const before = structuredClone(of(truth, 'note')[0].data)
  run(truth, 60)
  expect(of(truth, 'note')[0].data).toEqual(before)
})

test('a kinematic body moves at its own velocity and gravity does not touch it', () => {
  const truth = boot(scene([{ is: 'lift', pos: [-8, 3, 0], vel: [1, 0, 0] }]), sim)
  run(truth, 60)
  const d = of(truth, 'lift')[0].data
  expect(d.pos[0]).toBeCloseTo(-7, 4)
  expect(d.pos[1]).toBe(3)
  expect(d.vel).toEqual([1, 0, 0])
})

// With no gravity and no ground, a pebble and a stone three times as dense meet head on at 2 m/s
// each. Nothing bounces, so they leave together at the speed that keeps the momentum:
// (1·2 − 3·2) / (1 + 3) = −1.
test('a body\'s mass is its shape\'s density over its volume', () => {
  const truth = boot(scene([{ is: 'pebble', pos: [-1, 5, 0], vel: [2, 0, 0] }, { is: 'stone', pos: [1, 5, 0], vel: [-2, 0, 0] }], { gravity: [0, 0, 0], static: [] }), sim)
  run(truth, 60)
  expect(of(truth, 'pebble')[0].data.vel[0]).toBeCloseTo(-1, 2)
  expect(of(truth, 'stone')[0].data.vel[0]).toBeCloseTo(-1, 2)
})

// A stone thrown at the stack knocks the top crate off: the steps are full of contacts. Two
// truths of the scene stepped turn and turn about each land on the bytes of one stepped alone, so
// each truth has a world of its own.
test('truths of one scene step apart from each other and land on the same bytes', () => {
  const tipped = () => boot(scene([{ is: 'crate', pos: [0, 0.5, 0] }, { is: 'crate', pos: [0, 1.5, 0] }, { is: 'stone', pos: [-3, 1.6, 0.2], vel: [15, 0, 0] }]), sim)
  const bytes = (t: Truth) => JSON.stringify(t.rows.map((r: Row) => r.data))
  const alone = tipped()
  run(alone, 200)
  const a = tipped(), b = tipped()
  for (let i = 0; i < 200; i++) { a.step(DT); b.step(DT) }
  expect(dist(of(alone, 'crate')[1].data.pos, [0, 1.5, 0])).toBeGreaterThan(0.1)
  expect(bytes(a)).toBe(bytes(alone))
  expect(bytes(b)).toBe(bytes(alone))
})

test('a body\'s fixed numbers are world.box3d\'s, never its row\'s: the box3d row a scene starts is empty', () => {
  const truth = stack()
  run(truth, 5)
  expect(of(truth, 'box3d')[0].data).toEqual({})
})

// ---------------------------------------------------------------- shapes

// Each shape's mass, from its own volume at a density of 1000, against the mass Box3D gives it.
test('every hull-shaped geometry has the volume its numbers say: a box, a placed box, a scaled hull, a cylinder, a cone', () => {
  const h = 1.2, r = 0.4, r2 = 0.2
  const more = {
    placed: body({ box: [0.5, 0.25, 0.5], pos: [1, 0, 0], rot: [0, 0, 0, 1] }),
    stretched: body({ hull: { points: [-0.5, -0.5, -0.5, 0.5, -0.5, -0.5, 0.5, -0.5, 0.5, -0.5, -0.5, 0.5, -0.5, 0.5, -0.5, 0.5, 0.5, -0.5, 0.5, 0.5, 0.5, -0.5, 0.5, 0.5] }, scale: [2, 1, 3] }),
    drum: body({ cylinder: { height: h, radius: r, yOffset: 0, sides: 32 } }),
    frustum: body({ cone: { height: h, radius1: r, radius2: r2, slices: 32 } }),
  }
  const truth = boot(scene(Object.keys(more).map((is, i) => ({ is, pos: [i * 4 - 6, 5, 0] })), { kinds: more }, Object.fromEntries(Object.keys(more).map(k => [k, at([0, 5, 0])]))), simOf(Object.keys(more)))
  run(truth, 1)
  const w = wOf(truth)
  const mass = (kind: string) => massOf(w, of(truth, kind)[0])
  expect(mass('placed').mass).toBeCloseTo(1000 * 1 * 0.5 * 1, 1)
  // The placed box sits a metre along x on its body, so the body's centre of mass is there.
  expect(dist(mass('placed').center, [1, 0, 0])).toBeLessThan(1e-4)
  expect(mass('stretched').mass).toBeCloseTo(1000 * 2 * 1 * 3, 0)
  // A 32-sided prism and frustum stand on a 32-gon, whose area is n/2·sin(2π/n)·r².
  const polygon = (rad: number) => 32 / 2 * Math.sin(2 * Math.PI / 32) * rad * rad
  expect(mass('drum').mass / (1000 * polygon(r) * h)).toBeCloseTo(1, 2)
  const frustum = h / 3 * (polygon(r) + polygon(r2) + Math.sqrt(polygon(r) * polygon(r2)))
  expect(mass('frustum').mass / (1000 * frustum)).toBeCloseTo(1, 2)
})

// Box3D holds a hull to 128 vertices and 255 half edges: a 64-sided cylinder has 384.
test('a hull past Box3D\'s limits is refused, and says so', () => {
  const truth = boot(scene([{ is: 'drum' }], { kinds: { drum: body({ cylinder: { height: 1, radius: 0.4, yOffset: 0, sides: 64 } }) } }, { drum: at([0, 5, 0]) }), simOf(['drum']))
  expect(() => truth.step(DT)).toThrow('Box3D could not make a hull of')
})

// Each shape's lowest point where the body lies: its hull's vertices, as Box3D's makers make them,
// turned and moved by the row.
function lowest(hull: ArrayLike<number>, d: { pos: number[]; rot: number[] }) {
  const [x, y, z, w] = d.rot
  let low = Infinity
  for (let i = 0; i + 2 < hull.length; i += 3) {
    const [px, py, pz] = [hull[i], hull[i + 1], hull[i + 2]]
    // y of the point turned by the quaternion.
    const ty = 2 * (x * y + w * z) * px + (1 - 2 * (x * x + z * z)) * py + 2 * (y * z - w * x) * pz
    low = Math.min(low, d.pos[1] + ty)
  }
  return low
}

test('a hull, a cylinder, a cone and a rock each fall and come to rest on the ground, its lowest point at y = 0', () => {
  const wedge = [-0.5, 0, -0.5, 0.5, 0, -0.5, 0.5, 0, 0.5, -0.5, 0, 0.5, 0, 0.8, 0]
  const more = {
    wedge: body({ hull: { points: wedge } }),
    drum: body({ cylinder: { height: 1, radius: 0.4, yOffset: 0, sides: 16 } }),
    tip: body({ cone: { height: 1, radius1: 0.5, radius2: 0.1, slices: 16 } }),
    boulder: body({ rock: { radius: 0.5 } }),
  }
  const hulls = {
    wedge,
    drum: b3.b3GetHullVertices(b3.b3CreateCylinder(1, 0.4, 0, 16)),
    tip: b3.b3GetHullVertices(b3.b3CreateCone(1, 0.5, 0.1, 16)),
    boulder: b3.b3GetHullVertices(b3.b3CreateRock(0.5)),
  }
  const names = Object.keys(more) as (keyof typeof more)[]
  const truth = boot(scene(names.map((is, i) => ({ is, pos: [i * 3 - 5, 2, 0] })), { kinds: more }, Object.fromEntries(names.map(k => [k, at([0, 2, 0])]))), simOf(names))
  run(truth, 300)
  for (const k of names) {
    const d = of(truth, k)[0].data
    expect(d.awake, k).toBe(false)
    // Box3D rests a body within its linear slop, 5 mm, of what it stands on.
    expect(Math.abs(lowest(hulls[k], d)), k).toBeLessThan(0.005)
  }
})

test('a crate rests on a static triangle mesh, inline or made by Box3D, and on a height field, at the surface\'s height', () => {
  const plate: Static = { pos: [0, 0, 0], rot: [0, 0, 0, 1], shapes: [{ mesh: { positions: [-5, 0, -5, 5, 0, -5, 5, 0, 5, -5, 0, 5], indices: [0, 2, 1, 0, 3, 2] } }] }
  const grid: Static = { pos: [20, 1, 0], rot: [0, 0, 0, 1], shapes: [{ mesh: { make: 'grid', xCount: 10, zCount: 10, cellWidth: 1, materialCount: 1, identifyEdges: true } }] }
  // Heights 2 everywhere, scaled by 0.5 up: a flat field at y 1 over its origin.
  const field: Static = { pos: [40, 0, 0], rot: [0, 0, 0, 1], shapes: [{ heightField: { heights: new Array(25).fill(2), countX: 5, countZ: 5, scale: [1, 0.5, 1] } }] }
  const truth = boot(scene([{ is: 'crate', pos: [0, 2, 0] }, { is: 'crate', pos: [20, 3, 0] }, { is: 'crate', pos: [42, 3, 2] }], { static: [plate, grid, field] }), sim)
  run(truth, 240)
  const [a, b, c] = of(truth, 'crate')
  expect(a.data.pos[1]).toBeCloseTo(0.5, 2)
  // Box3D's grid lies at its body's y.
  expect(b.data.pos[1]).toBeCloseTo(1.5, 2)
  expect(c.data.pos[1]).toBeCloseTo(1.5, 2)
})

const folder = mkdtempSync(join(tmpdir(), 'box3d-sim-'))
afterAll(() => rmSync(folder, { recursive: true }))
const write = (name: string, value: unknown) => {
  writeFileSync(join(folder, name), JSON.stringify(value))
  return '/' + relative(process.cwd(), join(folder, name))
}

test('a mesh and a height field may be data files of the scene\'s loader catalogue', async () => {
  const floor = write('floor.json', { positions: [-5, 0, -5, 5, 0, -5, 5, 0, 5, -5, 0, 5], indices: [0, 2, 1, 0, 3, 2] })
  const hills = write('hills.json', { heights: new Array(25).fill(3), countX: 5, countZ: 5 })
  await jsonAt('floor', floor)
  await jsonAt('hills', hills)
  const s = scene([{ is: 'crate', pos: [0, 2, 0] }, { is: 'crate', pos: [22, 3, 2] }], {
    static: [
      { pos: [0, 0, 0], rot: [0, 0, 0, 1], shapes: [{ mesh: { asset: 'floor' } }] },
      { pos: [20, 0, 0], rot: [0, 0, 0, 1], shapes: [{ heightField: { asset: 'hills', scale: [1, 0.5, 1] } }] },
    ],
  })
  s.world!.loader = { assets: { floor: { type: 'json', url: floor, preload: true }, hills: { type: 'json', url: hills, preload: true } } }
  s.prefabs.loader = {}
  s.actors.unshift({ is: 'loader' })
  const truth = boot(s, { ...sim, loader })
  run(truth, 240)
  const [a, b] = of(truth, 'crate')
  expect(a.data.pos[1]).toBeCloseTo(0.5, 2)
  expect(b.data.pos[1]).toBeCloseTo(2, 2)
})

test('a compound of hulls is a static body\'s, and a compound on a body that moves throws', () => {
  const hull = (x: number) => ({ points: [-1, -0.5, -1, 1, -0.5, -1, 1, -0.5, 1, -1, -0.5, 1, -1, 0.5, -1, 1, 0.5, -1, 1, 0.5, 1, -1, 0.5, 1], pos: [x, 0, 0] as [number, number, number], rot: [0, 0, 0, 1] as [number, number, number, number] })
  const steps: Static = { pos: [0, 0.5, 0], rot: [0, 0, 0, 1], shapes: [{ compound: { hulls: [hull(-1), hull(1)] } }] }
  const truth = boot(scene([{ is: 'crate', pos: [-1, 3, 0] }, { is: 'crate', pos: [1, 3, 0] }], { static: [steps] }), sim)
  run(truth, 200)
  for (const c of of(truth, 'crate')) expect(c.data.pos[1]).toBeCloseTo(1.5, 2)
  const bad = boot(scene([{ is: 'heap' }], { kinds: { heap: body({ compound: { hulls: [hull(0)] } }) } }, { heap: at([0, 3, 0]) }), simOf(['heap']))
  expect(() => bad.step(DT)).toThrow('a compound shape is only for a static body')
})

// ---------------------------------------------------------------- surfaces and filters

// A pebble dropped from 2 m meets the ground at √(2·g·h); with restitution 1 it leaves at that
// speed and climbs back to within a hand's width of where it fell from.
test('restitution: a pebble of restitution 1 bounces back to the height it fell from', () => {
  const bouncy = body({ sphere: { center: [0, 0, 0], radius: 0.3 } }, 1000, { shapes: [{ sphere: { center: [0, 0, 0], radius: 0.3 }, density: 1000, baseMaterial: { friction: 0.6, restitution: 1, rollingResistance: 0 } }] })
  const truth = boot(scene([{ is: 'ball', pos: [0, 2.3, 0] }], { kinds: { ball: bouncy } }, { ball: at([0, 2.3, 0]) }), simOf(['ball']))
  let peak = 0, fell = false
  for (let i = 0; i < 240; i++) {
    truth.step(DT)
    const d = of(truth, 'ball')[0].data
    if (d.vel[1] > 0) fell = true
    if (fell) peak = Math.max(peak, d.pos[1])
  }
  expect(peak).toBeGreaterThan(2.3 - 0.1)
  expect(peak).toBeLessThan(2.3 + 0.05)
})

test('tangentVelocity: a crate on a belt is carried at the belt\'s speed', () => {
  const belt: Static = { pos: [0, -0.5, 0], rot: [0, 0, 0, 1], shapes: [{ box: [20, 0.5, 2], density: 0, baseMaterial: { friction: 0.8, tangentVelocity: [2, 0, 0] } }] }
  const truth = boot(scene([{ is: 'crate', pos: [0, 0.5, 0] }], { static: [belt] }), sim)
  run(truth, 120)
  expect(of(truth, 'crate')[0].data.vel[0]).toBeCloseTo(2, 1)
})

test('rollingResistance: of two balls rolled alike, the one that resists rolling stops first', () => {
  const ball = (rr: number) => body({ sphere: { center: [0, 0, 0], radius: 0.3 } }, 1000, { shapes: [{ sphere: { center: [0, 0, 0], radius: 0.3 }, density: 1000, baseMaterial: { friction: 0.6, restitution: 0, rollingResistance: rr } }] })
  const truth = boot(scene([{ is: 'free', pos: [0, 0.3, -2], vel: [3, 0, 0] }, { is: 'sticky', pos: [0, 0.3, 2], vel: [3, 0, 0] }], { kinds: { free: ball(0), sticky: ball(0.3) } }, { free: at([0, 0.3, 0]), sticky: at([0, 0.3, 0]) }), simOf(['free', 'sticky']))
  run(truth, 120)
  expect(len(of(truth, 'sticky')[0].data.vel)).toBeLessThan(len(of(truth, 'free')[0].data.vel) - 0.5)
})

test('filter: a crate whose mask leaves out the ground\'s category falls through it; two of one negative group pass through each other', () => {
  const ghost = body({ box: [0.5, 0.5, 0.5] }, 1000, { shapes: [{ box: [0.5, 0.5, 0.5], density: 1000, filter: { categoryBits: 2, maskBits: 2 } }] })
  const grouped = body({ box: [0.5, 0.5, 0.5] }, 1000, { shapes: [{ box: [0.5, 0.5, 0.5], density: 1000, filter: { groupIndex: -1 } }] })
  const low: Static = { ...ground, shapes: [{ box: [20, 1, 20], filter: { categoryBits: 1 } }] }
  const truth = boot(scene([{ is: 'ghost', pos: [0, 1, 0] }, { is: 'grouped', pos: [5, 0.5, 0] }, { is: 'grouped', pos: [5, 1.2, 0] }], { static: [low], kinds: { ghost, grouped } }, { ghost: at([0, 1, 0]), grouped: at([0, 0.5, 0]) }), simOf(['ghost', 'grouped']))
  run(truth, 60)
  expect(of(truth, 'ghost')[0].data.pos[1]).toBeLessThan(-2)
  const [a, b] = of(truth, 'grouped')
  expect(Math.abs(a.data.pos[1] - b.data.pos[1])).toBeLessThan(0.1)
})

// ---------------------------------------------------------------- events

test('contact events: a body that asks is told who it touches, the ground as -1, and no more once it lifts off', () => {
  const felt = body({ box: [0.5, 0.5, 0.5] }, 1000, { shapes: [{ box: [0.5, 0.5, 0.5], density: 1000, enableContactEvents: true }] })
  const truth = boot(scene([{ is: 'felt', pos: [0, 0.5, 0] }, { is: 'felt', pos: [0, 1.5, 0] }], { kinds: { felt } }, { felt: at([0, 0.5, 0]) }), simOf(['felt']))
  run(truth, 30)
  const [lo, hi] = of(truth, 'felt')
  expect(lo.data.touching).toEqual([-1, hi.id])
  expect(hi.data.touching).toEqual([lo.id])
  hi.data.pos = [8, 5, 0]
  run(truth, 2)
  expect(lo.data.touching).toEqual([-1])
  expect('touching' in hi.data).toBe(false)
  // A kind that does not ask carries no field for it.
  const plain = stack()
  run(plain, 30)
  expect(of(plain, 'crate').some(r => 'touching' in r.data)).toBe(false)
})

// Dropped from 5 m, the pebble meets the ground at √(2·10·(5 − 0.3)) ≈ 9.70 m/s.
test('hit events: a body that asks is told of an impact, the thing it struck, where, and how fast', () => {
  const hard = body({ sphere: { center: [0, 0, 0], radius: 0.3 } }, 1000, { enableHitEvents: true, shapes: [{ sphere: { center: [0, 0, 0], radius: 0.3 }, density: 1000, enableHitEvents: true }] })
  const truth = boot(scene([{ is: 'hard', pos: [2, 5, 0] }], { kinds: { hard } }, { hard: at([0, 5, 0]) }), simOf(['hard']))
  const hits: any[] = []
  for (let i = 0; i < 120; i++) {
    truth.step(DT)
    const d = of(truth, 'hard')[0].data
    if (d.hits) hits.push(...d.hits)
  }
  expect(hits.length).toBeGreaterThan(0)
  const first = hits[0]
  expect(first.with).toBe(-1)
  expect(first.speed).toBeCloseTo(Math.sqrt(2 * G * (5 - 0.3)), 0)
  expect(first.normal[1]).toBeCloseTo(1, 3)
  expect(Math.abs(first.point[1])).toBeLessThan(0.05)
  // Only the step of the impact carries it.
  run(truth, 1)
  expect('hits' in of(truth, 'hard')[0].data).toBe(false)
})

test('sensor events: a sensor names the bodies inside it while they are, and they fall through it', () => {
  const gate = { type: 'static', shapes: [{ box: [2, 2, 2], isSensor: true, enableSensorEvents: true }] } satisfies Body
  const seen = body({ box: [0.5, 0.5, 0.5] }, 1000, { shapes: [{ box: [0.5, 0.5, 0.5], density: 1000, enableSensorEvents: true }] })
  const truth = boot(scene([{ is: 'gate', pos: [0, 4, 0] }, { is: 'seen', pos: [0, 12, 0] }], { kinds: { gate, seen } }, { gate: at([0, 4, 0]), seen: at([0, 12, 0]) }), simOf(['gate', 'seen']))
  const g = of(truth, 'gate')[0], s = of(truth, 'seen')[0]
  let inside = 0
  for (let i = 0; i < 180; i++) {
    truth.step(DT)
    // Inside the gate's box, by where the crate stands, is where the sensor must name it.
    const within = Math.abs(s.data.pos[1] - 4) < 2 + 0.5 - 0.1
    if (within) { inside++; expect(g.data.visitors).toEqual([s.id]) }
    if (Math.abs(s.data.pos[1] - 4) > 2 + 0.5 + 0.2) expect('visitors' in g.data).toBe(false)
  }
  expect(inside).toBeGreaterThan(0)
  expect(s.data.pos[1]).toBeCloseTo(0.5, 2)
})

test('oneWay: a pebble thrown up through a platform passes it, then lands on it', () => {
  const shelf: Static = { pos: [0, 3, 0], rot: [0, 0, 0, 1], shapes: [{ box: [2, 0.1, 2], oneWay: [0, 1, 0] }] }
  const truth = boot(scene([{ is: 'pebble', pos: [0, 0.3, 0], vel: [0, 12, 0] }], { static: [ground, shelf] }), sim)
  let above = false
  for (let i = 0; i < 240; i++) {
    truth.step(DT)
    if (of(truth, 'pebble')[0].data.pos[1] > 3.5) above = true
  }
  expect(above).toBe(true)
  expect(of(truth, 'pebble')[0].data.pos[1]).toBeCloseTo(3.1 + 0.3, 2)
})

// ---------------------------------------------------------------- what a rule has a body do

// No gravity: a force F held on a body of mass m for t seconds leaves it at F·t/m.
test('force: a force held on the row speeds the body by F·t/m', () => {
  const truth = boot(scene([{ is: 'crate', pos: [0, 5, 0], force: [500, 0, 0] }], { gravity: [0, 0, 0], static: [] }), sim)
  run(truth, 60)
  expect(of(truth, 'crate')[0].data.vel[0]).toBeCloseTo(500 * 1 / 1000, 3)
})

// A sphere's inertia about any axis is 2/5·m·r²: a torque τ for t seconds spins it at τ·t/I.
test('torque: a torque held on the row spins the body by τ·t/I', () => {
  const m = 1000 * 4 / 3 * Math.PI * 0.3 ** 3, I = 2 / 5 * m * 0.3 ** 2
  const truth = boot(scene([{ is: 'pebble', pos: [0, 5, 0], torque: [0, 2, 0] }], { gravity: [0, 0, 0], static: [] }), sim)
  run(truth, 60)
  expect(of(truth, 'pebble')[0].data.spin[1] / (2 * 1 / I)).toBeCloseTo(1, 2)
})

test('pushes: an impulse J changes the speed by J/m once and the field goes; one at a point off the centre spins it by r×J/I', () => {
  const truth = boot(scene([{ is: 'crate', pos: [0, 5, 0] }, { is: 'crate', pos: [5, 5, 0] }], { gravity: [0, 0, 0], static: [] }), sim)
  const [a, b] = of(truth, 'crate')
  a.data.pushes = [{ impulse: [1000, 0, 0] }]
  // J = 100 along z at 0.5 m up from the centre: r×J = (0, 0.5, 0)×(0, 0, 100) = (50, 0, 0). A unit
  // cube's inertia is m/6.
  b.data.pushes = [{ impulse: [0, 0, 100], point: [5, 5.5, 0] }, { angular: [0, 10, 0] }]
  run(truth, 1)
  expect(a.data.vel[0]).toBeCloseTo(1, 4)
  expect('pushes' in a.data).toBe(false)
  run(truth, 10)
  expect(a.data.vel[0]).toBeCloseTo(1, 4)
  expect(b.data.vel[2]).toBeCloseTo(0.1, 4)
  expect(b.data.spin[0]).toBeCloseTo(50 / (1000 / 6), 3)
  expect(b.data.spin[1]).toBeCloseTo(10 / (1000 / 6), 3)
})

test('target: a kinematic body given a target is there after the next step', () => {
  const truth = boot(scene([{ is: 'lift', pos: [0, 3, 0] }]), sim)
  const l = of(truth, 'lift')[0]
  l.data.target = { pos: [2, 4, 1], rot: [0, 0, 0, 1] }
  run(truth, 1)
  expect(dist(l.data.pos, [2, 4, 1])).toBeLessThan(1e-4)
})

// Air at 1.225 kg/m³ presses a ball in a 10 m/s wind with ½·ρ·A·v²: 0.35 N on π·0.3² m².
test('wind: a pebble in the wind is pushed by ½·ρ·A·v²', () => {
  const wind = { wind: [10, 0, 0], drag: 0, lift: 0, maxSpeed: 100 }
  const truth = boot(scene([{ is: 'pebble', pos: [5, 5, 0], wind }], { gravity: [0, 0, 0], static: [] }), sim)
  run(truth, 20)
  const p = of(truth, 'pebble')[0].data
  expect(p.vel[0] / (0.5 * 1.225 * Math.PI * 0.09 * 100 / (1000 * 4 / 3 * Math.PI * 0.027) * 20 * DT)).toBeCloseTo(1, 3)
})

test('motionLocks: a body locked along x keeps its x however it is pushed', () => {
  const locked = body({ box: [0.5, 0.5, 0.5] }, 1000, { motionLocks: { linearX: true } })
  const truth = boot(scene([{ is: 'locked', pos: [0, 5, 0] }], { kinds: { locked }, gravity: [0, 0, 0], static: [] }, { locked: at([0, 5, 0]) }), simOf(['locked']))
  of(truth, 'locked')[0].data.pushes = [{ impulse: [1000, 1000, 0] }]
  run(truth, 30)
  const d = of(truth, 'locked')[0].data
  expect(d.pos[0]).toBe(0)
  expect(d.pos[1]).toBeGreaterThan(5.4)
})

test('mass: a kind\'s mass data replaces what its shapes\' densities give', () => {
  const heavy = body({ box: [0.5, 0.5, 0.5] }, 1000, { mass: { mass: 50, center: [0, 0, 0], inertia: { cx: [10, 0, 0], cy: [0, 10, 0], cz: [0, 0, 10] } } })
  const truth = boot(scene([{ is: 'heavy', pos: [0, 5, 0] }], { kinds: { heavy }, gravity: [0, 0, 0], static: [] }, { heavy: at([0, 5, 0]) }), simOf(['heavy']))
  of(truth, 'heavy')[0].data.pushes = [{ impulse: [100, 0, 0] }]
  run(truth, 1)
  expect(of(truth, 'heavy')[0].data.vel[0]).toBeCloseTo(2, 4)
})

// ---------------------------------------------------------------- a body's live settings

test('a live setting on the row is the body\'s over its kind\'s, and changes it while it runs', () => {
  const truth = boot(scene([{ is: 'pebble', pos: [0, 5, 0], gravityScale: 0 }, { is: 'crate', pos: [4, 3, 0] }]), sim)
  const p = of(truth, 'pebble')[0], c = of(truth, 'crate')[0]
  run(truth, 10)
  expect(p.data.pos[1]).toBe(5)
  p.data.gravityScale = 1
  run(truth, 10)
  expect(p.data.pos[1]).toBeLessThan(5)
  // A crate turned static hangs where it is; turned back, it falls.
  c.data.type = 'static'
  run(truth, 30)
  const hung = c.data.pos[1]
  expect(hung).toBeGreaterThan(0.6)
  run(truth, 30)
  expect(c.data.pos[1]).toBe(hung)
  c.data.type = 'dynamic'
  run(truth, 60)
  expect(c.data.pos[1]).toBeCloseTo(0.5, 2)
})

test('friction on the row is every one of the body\'s shapes\' friction, from its first step and live, mixed with the ground\'s as √(a·b)', () => {
  // Crates sliding at 4 m/s on ground of friction 0.6 slow by μ·g, μ = √(own · 0.6).
  const truth = boot(scene([{ is: 'crate', pos: [0, 0.5, -3], vel: [4, 0, 0] }, { is: 'crate', pos: [0, 0.5, 3], vel: [4, 0, 0], friction: 0.15 }]), sim)
  const [plain, slick] = of(truth, 'crate')
  run(truth, 2)
  const slowing = (c: Row) => { const v = c.data.vel[0]; run(truth, 12); return (v - c.data.vel[0]) / (12 * DT) }
  const a = slowing(plain), b = slowing(slick)
  expect(a).toBeCloseTo(0.6 * G, 0)
  expect(b).toBeCloseTo(Math.sqrt(0.15 * 0.6) * G, 0)
  slick.data.friction = 0.6
  run(truth, 1)
  expect(slowing(slick)).toBeCloseTo(0.6 * G, 0)
})

test('enabled false takes a body out of the world: what stood on it falls, and it holds still', () => {
  const shelf = { type: 'static', shapes: [{ box: [2, 0.1, 2] }] } satisfies Body
  const truth = boot(scene([{ is: 'shelf', pos: [0, 3, 0] }, { is: 'crate', pos: [0, 3.6, 0] }], { kinds: { shelf } }, { shelf: at([0, 3, 0]) }), simOf(['shelf']))
  run(truth, 60)
  const c = of(truth, 'crate')[0]
  expect(c.data.pos[1]).toBeCloseTo(3.6, 2)
  of(truth, 'shelf')[0].data.enabled = false
  run(truth, 90)
  expect(c.data.pos[1]).toBeCloseTo(0.5, 2)
})

test('enableSleep false on the row keeps a resting body awake', () => {
  const truth = boot(scene([{ is: 'crate', pos: [0, 0.5, 0], enableSleep: false }]), sim)
  run(truth, 180)
  expect(of(truth, 'crate')[0].data.awake).toBe(true)
})

// ---------------------------------------------------------------- joints

const hinge = (over: Partial<Joint> = {}): Joint => ({ type: 'revolute', localFrameA: { pos: [0, 0, 0], rot: [0, 0, 0, 1] }, localFrameB: { pos: [0, 2, 0], rot: [0, 0, 0, 1] }, ...over } as Joint)
const jointScene = (joints: Record<string, Joint>, actors: Scene['actors'], over: Partial<World> = {}) =>
  boot(scene(actors, { ...over, joints, static: over.static ?? [ground, { pos: [0, 10, 0], rot: [0, 0, 0, 1], shapes: [{ box: [0.1, 0.1, 0.1] }] }] }, Object.fromEntries(Object.keys(joints).map(k => [k, {}]))), simOf(Object.keys(joints)))

// A pebble of radius 0.3 on a 2 m arm from a pin: a physical pendulum, whose small swings take
// 2π·√(I/(m·g·L)) with I = 2/5·m·r² + m·L².
// The bob starts where the joint holds it, swung 0.1 about z: its centre 2 m from the pin and turned
// as the arm is.
const swung = (t: number) => ({ pos: [2 * Math.sin(t), 10 - 2 * Math.cos(t), 0], rot: [0, 0, Math.sin(t / 2), Math.cos(t / 2)] })
test('revolute: a pendulum swings at the period its length gives, and its angle is where the bob is', () => {
  const truth = jointScene({ pin: hinge() }, [{ is: 'pebble', ...swung(0.1) }, { is: 'pin', a: -2, b: 2 }])
  const bob = of(truth, 'pebble')[0], pin = of(truth, 'pin')[0]
  const L = 2, r = 0.3
  const period = 2 * Math.PI * Math.sqrt((2 / 5 * r * r + L * L) / (G * L))
  const crossings: number[] = []
  let last = bob.data.pos[0]
  for (let i = 0; i < 600; i++) {
    truth.step(DT)
    const x = bob.data.pos[0]
    if (last < 0 && x >= 0) crossings.push(i)
    last = x
    // The hinge turns about z: the angle is the bob's swing from straight down.
    const swing = Math.atan2(bob.data.pos[0], 10 - bob.data.pos[1])
    expect(pin.data.measured.angle).toBeCloseTo(swing, 2)
  }
  const measured = (crossings[crossings.length - 1] - crossings[0]) / (crossings.length - 1) * DT
  expect(measured / period).toBeCloseTo(1, 1)
})

test('revolute motor: a motor turns the hinge at its speed, and the row\'s motorSpeed changes it live', () => {
  const truth = jointScene({ pin: hinge({ enableMotor: true, maxMotorTorque: 1e6, motorSpeed: 1 }) }, [{ is: 'pebble', pos: [0, 8, 0] }, { is: 'pin', a: -2, b: 2 }], { gravity: [0, 0, 0] })
  const pin = of(truth, 'pin')[0]
  // The motor is a soft constraint: the arm comes up to its speed over a second and a half.
  run(truth, 90)
  const a0 = pin.data.measured.angle
  run(truth, 60)
  expect((pin.data.measured.angle - a0) / (60 * DT)).toBeCloseTo(1, 2)
  pin.data.motorSpeed = -2
  run(truth, 90)
  const a1 = pin.data.measured.angle
  run(truth, 60)
  expect((pin.data.measured.angle - a1) / (60 * DT)).toBeCloseTo(-2, 2)
})

// An arm held out level drops onto its lower limit and rests there. Box3D's limit is soft (the
// joint's constraintHertz, 60 by default): a 2 m arm dropping onto it presses 0.025 rad past it at
// the blow and then rests on it.
test('revolute limit: an arm dropped onto its limit is stopped there and rests on it', () => {
  const truth = jointScene({ pin: hinge({ enableLimit: true, lowerAngle: -0.2, upperAngle: 0.2 }) }, [{ is: 'pebble', pos: [2, 10, 0] }, { is: 'pin', a: -2, b: 2, localFrameB: { pos: [-2, 0, 0], rot: [0, 0, 0, 1] } }])
  const pin = of(truth, 'pin')[0]
  for (let i = 0; i < 240; i++) {
    truth.step(DT)
    expect(Math.abs(pin.data.measured.angle)).toBeLessThan(0.2 + 0.03)
  }
  expect(pin.data.measured.angle).toBeCloseTo(-0.2, 2)
})

test('prismatic: a slider moves along its axis only, its translation is how far, and its limit stops it', () => {
  const slide: Joint = { type: 'prismatic', enableLimit: true, lowerTranslation: -1, upperTranslation: 1.5, enableMotor: true, maxMotorForce: 1e5, motorSpeed: 1 }
  const truth = jointScene({ slide }, [{ is: 'crate', pos: [0, 10, 0] }, { is: 'slide', a: -2, b: 2 }])
  const c = of(truth, 'crate')[0], s = of(truth, 'slide')[0]
  run(truth, 30)
  expect(s.data.measured.translation).toBeCloseTo(c.data.pos[0], 3)
  expect(s.data.measured.speed).toBeCloseTo(1, 2)
  expect(c.data.pos[1]).toBeCloseTo(10, 2)
  run(truth, 180)
  expect(c.data.pos[0]).toBeCloseTo(1.5, 2)
})

test('distance: a rope holds its length between the two anchors, and its currentLength is that', () => {
  const rope: Joint = { type: 'distance', length: 3, enableSpring: false }
  const truth = jointScene({ rope }, [{ is: 'pebble', pos: [3, 10, 0] }, { is: 'rope', a: -2, b: 2 }])
  const p = of(truth, 'pebble')[0], r = of(truth, 'rope')[0]
  // Box3D's joints are soft (constraintHertz 60): the rope stretches by millimetres as the bob
  // swings on it.
  for (let i = 0; i < 180; i++) {
    truth.step(DT)
    expect(Math.abs(dist(p.data.pos, [0, 10, 0]) - 3)).toBeLessThan(0.01)
  }
  expect(r.data.measured.currentLength).toBeCloseTo(dist(p.data.pos, [0, 10, 0]), 3)
})

// A body on a stiff spring hangs until the spring pulls as hard as gravity: Box3D's spring is its
// frequency, so its stiffness is m·(2π·f)² and the sag is g/(2π·f)².
test('wheel: a wheel on its suspension sags by g/(2πf)² under its own weight, spins at its motor\'s speed, and steers to its target', () => {
  const f = 2
  const wheel: Joint = {
    type: 'wheel', localFrameA: { pos: [0, 0, 0], rot: [0, 0, Math.SQRT1_2, Math.SQRT1_2] },
    enableSuspensionSpring: true, suspensionHertz: f, suspensionDampingRatio: 1,
    enableSpinMotor: true, maxSpinTorque: 1e4, spinSpeed: 5,
    enableSteering: true, steeringHertz: 5, steeringDampingRatio: 1, maxSteeringTorque: 1e4, targetSteeringAngle: 0.3,
  }
  const truth = jointScene({ wheel }, [{ is: 'pebble', pos: [0, 10, 0] }, { is: 'wheel', a: -2, b: 2 }])
  const p = of(truth, 'pebble')[0], w = of(truth, 'wheel')[0]
  run(truth, 240)
  const sag = G / (2 * Math.PI * f) ** 2
  // The suspension runs along frame A's x, which the quarter turn about z lays along y.
  expect((10 - p.data.pos[1]) / sag).toBeCloseTo(1, 1)
  expect(w.data.measured.spinSpeed).toBeCloseTo(5, 1)
  expect(w.data.measured.steeringAngle).toBeCloseTo(0.3, 2)
  w.data.targetSteeringAngle = -0.2
  run(truth, 120)
  expect(w.data.measured.steeringAngle).toBeCloseTo(-0.2, 2)
})

test('weld: two welded crates keep their pose to each other as they fall and tumble', () => {
  const weld: Joint = { type: 'weld', localFrameA: { pos: [0.5, 0, 0], rot: [0, 0, 0, 1] }, localFrameB: { pos: [-0.5, 0, 0], rot: [0, 0, 0, 1] } }
  const truth = jointScene({ weld }, [{ is: 'crate', pos: [0, 5, 0], spin: [1, 2, 0] }, { is: 'crate', pos: [1, 5, 0] }, { is: 'weld', a: 2, b: 3 }])
  const [a, b] = of(truth, 'crate')
  for (let i = 0; i < 240; i++) {
    truth.step(DT)
    expect(dist(a.data.pos, b.data.pos)).toBeCloseTo(1, 2)
  }
})

// A bob let go 0.25 from straight down swings within a cone 0.3 wide.
test('spherical: a ball joint keeps the bob within its cone, and its coneAngle is the bob\'s angle from straight down', () => {
  const q: [number, number, number, number] = [Math.SQRT1_2, 0, 0, Math.SQRT1_2]
  const ball: Joint = { type: 'spherical', localFrameA: { pos: [0, 0, 0], rot: q }, localFrameB: { pos: [0, 2, 0], rot: q }, enableConeLimit: true, coneAngle: 0.3 }
  const truth = jointScene({ ball }, [{ is: 'pebble', ...swung(0.25) }, { is: 'ball', a: -2, b: 2 }])
  const p = of(truth, 'pebble')[0], b = of(truth, 'ball')[0]
  run(truth, 30)
  for (let i = 0; i < 240; i++) {
    truth.step(DT)
    const off = p.data.pos.map((c: number, k: number) => c - [0, 10, 0][k])
    const angle = Math.acos(-off[1] / len(off))
    expect(angle).toBeLessThan(0.3 + 0.01)
    expect(b.data.measured.coneAngle).toBeCloseTo(angle, 2)
  }
})

test('motor joint: a body is driven at the joint\'s linear velocity', () => {
  const drive: Joint = { type: 'motor', linearVelocity: [1, 0, 0], maxVelocityForce: 1e5, maxVelocityTorque: 1e5 }
  const truth = jointScene({ drive }, [{ is: 'crate', pos: [0, 10, 0] }, { is: 'drive', a: -2, b: 2 }], { gravity: [0, 0, 0] })
  run(truth, 60)
  expect(of(truth, 'crate')[0].data.vel[0]).toBeCloseTo(1, 2)
})

// Box3D's parallel joint holds the two frames' z axes parallel and leaves the turn about z free.
test('parallel: a body joined parallel to the ground keeps its z axis upright when spun across it, and spins freely about it', () => {
  const upright: Joint = { type: 'parallel', hertz: 10, dampingRatio: 1, maxTorque: 1e6 }
  const truth = jointScene({ upright }, [{ is: 'crate', pos: [0, 10, 0], spin: [3, 0, 0] }, { is: 'crate', pos: [4, 10, 0], spin: [0, 0, 3] }, { is: 'upright', a: -2, b: 2 }, { is: 'upright', a: -2, b: 3 }], { gravity: [0, 0, 0] })
  run(truth, 120)
  const [tipped, turning] = of(truth, 'crate')
  // The body's z axis in the world: the quaternion's rotation of (0, 0, 1).
  const zOf = ([x, y, z, w]: number[]) => [2 * (x * z + w * y), 2 * (y * z - w * x), 1 - 2 * (x * x + y * y)]
  expect(zOf(tipped.data.rot)[2]).toBeGreaterThan(0.999)
  expect(zOf(turning.data.rot)[2]).toBeGreaterThan(0.999)
  expect(turning.data.spin[2]).toBeCloseTo(3, 3)
})

test('filter joint: two bodies it joins pass through each other', () => {
  const truth = jointScene({ apart: { type: 'filter' } }, [{ is: 'crate', pos: [0, 0.5, 0] }, { is: 'crate', pos: [0, 1.2, 0] }, { is: 'apart', a: 2, b: 3 }])
  run(truth, 60)
  const [a, b] = of(truth, 'crate')
  expect(Math.abs(a.data.pos[1] - b.data.pos[1])).toBeLessThan(0.05)
})

test('strained: a joint loaded past its threshold says so on that step, and the rule may end it', () => {
  const weak = hinge({ forceThreshold: 50 })
  const truth = jointScene({ pin: weak }, [{ is: 'crate', pos: [0, 8, 0] }, { is: 'pin', a: -2, b: 2 }])
  const pin = of(truth, 'pin')[0], c = of(truth, 'crate')[0]
  run(truth, 5)
  expect(pin.data.strained).toBe(true)
  expect(len(pin.data.measured.constraintForce)).toBeGreaterThan(50)
  truth.end(pin)
  run(truth, 150)
  expect(c.data.pos[1]).toBeCloseTo(0.5, 2)
})

test('a joint waits for its bodies, goes with one, and its row then carries no reading', () => {
  const truth = jointScene({ pin: hinge() }, [{ is: 'pin', a: -2, b: 99 }])
  run(truth, 3)
  const pin = of(truth, 'pin')[0]
  expect('measured' in pin.data).toBe(false)
  const bob = truth.spawn('pebble', { pos: [0, 8, 0] })
  pin.data.b = bob.id
  run(truth, 2)
  expect(pin.data.measured.angle).toBeCloseTo(0, 3)
  truth.end(bob)
  run(truth, 1)
  expect('measured' in pin.data).toBe(false)
})

test('truths of a scene with joints land on the same bytes', () => {
  const make = () => jointScene({ pin: hinge() }, [{ is: 'pebble', pos: [1.5, 8.7, 0] }, { is: 'pin', a: -2, b: 2 }, { is: 'crate', pos: [0.4, 3, 0] }])
  const bytes = (t: Truth) => JSON.stringify(t.rows.map((r: Row) => r.data))
  const a = make(), b = make()
  for (let i = 0; i < 300; i++) { a.step(DT); b.step(DT) }
  expect(bytes(a)).toBe(bytes(b))
})

// ---------------------------------------------------------------- the world

test('the box3d row\'s gravity and subStepCount are the live world\'s', () => {
  const truth = boot(scene([{ is: 'pebble', pos: [0, 10, 0] }]), sim)
  const w = of(truth, 'box3d')[0]
  w.data.gravity = [0, 0, 0]
  run(truth, 10)
  expect(of(truth, 'pebble')[0].data.pos[1]).toBe(10)
  w.data.gravity = [0, -G, 0]
  w.data.subStepCount = 8
  run(truth, 30)
  expect(of(truth, 'pebble')[0].data.vel[1]).toBeCloseTo(-G * 30 * DT, 2)
})

// Box3D's explosion gives each shape within `radius` impulsePerArea times its area facing the
// blast: a unit cube 1.5 m off takes 100 N·s on its 1 m² face, 0.1 m/s on its 1000 kg.
test('explode: the act blows the bodies within its radius away from the point by impulsePerArea·A/m, on the next step', () => {
  const truth = boot(scene([{ is: 'crate', pos: [-2, 5, 0] }, { is: 'crate', pos: [2, 5, 0] }, { is: 'crate', pos: [0, 5, 9] }], { gravity: [0, 0, 0], static: [] }), sim)
  run(truth, 1)
  wOf(truth).call(of(truth, 'box3d')[0], 'explode', 0, 0, 5, 0, 5, 1, 100)
  run(truth, 1)
  const [l, r, far] = of(truth, 'crate')
  expect(l.data.vel[0]).toBeCloseTo(-0.1, 4)
  expect(r.data.vel[0]).toBeCloseTo(0.1, 4)
  expect(len(far.data.vel)).toBe(0)
  expect('explosions' in of(truth, 'box3d')[0].data).toBe(false)
})

// ---------------------------------------------------------------- queries

test('castRayClosest and castRay: a ray down meets the crate\'s top first, then the ground, by the rows\' ids', () => {
  const truth = stack()
  run(truth, 120)
  const w = wOf(truth)
  const [lo, hi] = of(truth, 'crate')
  const first = castRayClosest(w, [0.1, 10, 0.1], [0, -20, 0])!
  expect(first.id).toBe(hi.id)
  expect(first.point[1]).toBeCloseTo(2, 2)
  expect(first.fraction).toBeCloseTo((10 - 2) / 20, 3)
  const all = castRay(w, [0.1, 10, 0.1], [0, -20, 0])
  expect(all.map(h => h.id)).toEqual([hi.id, lo.id, -1])
  expect(all.map(h => +h.point[1].toFixed(2))).toEqual([2, 1, 0])
  // A mask that names no category meets nothing.
  expect(castRayClosest(w, [0.1, 10, 0.1], [0, -20, 0], { maskBits: 0 })).toBeUndefined()
})

test('castShape: a 0.2 m sphere swept down meets the crate\'s top when its bottom does', () => {
  const truth = stack()
  run(truth, 120)
  const hits = castShape(wOf(truth), [0, 10, 0], [0, 0, 0], 0.2, [0, -20, 0])
  expect(hits[0].id).toBe(of(truth, 'crate')[1].id)
  expect(hits[0].fraction).toBeCloseTo((10 - 0.2 - 2) / 20, 2)
})

test('overlapShape and overlapAABB name the bodies that are there', () => {
  const truth = stack()
  run(truth, 120)
  const w = wOf(truth)
  const [lo, hi] = of(truth, 'crate')
  expect(overlapShape(w, [0, 1.5, 0], [0, 0, 0], 0.1)).toEqual([hi.id])
  expect(overlapAABB(w, [-0.1, 0.4, -0.1, 0.1, 1.6, 0.1])).toEqual([lo.id, hi.id])
  expect(overlapAABB(w, [5, 5, 5, 6, 6, 6])).toEqual([])
})

test('the character mover: a capsule falls to the ground, is pushed out by its plane, and slides along it', () => {
  const truth = stack()
  run(truth, 1)
  const w = wOf(truth)
  const capsule = { center1: [0, 0.3, 0] as [number, number, number], center2: [0, 1.5, 0] as [number, number, number], radius: 0.3 }
  // From 5 m up, 10 m down, the capsule's bottom (0 m under its origin) meets the ground at 5 m.
  expect(castMover(w, [8, 5, 0], capsule, [0, -10, 0])).toBeCloseTo(5 / 10, 2)
  const planes = collideMover(w, [8, -0.1, 0], capsule)
  expect(planes.length).toBeGreaterThan(0)
  expect(planes[0].id).toBe(-1)
  expect(planes[0].normal[1]).toBeCloseTo(1, 3)
  // Asked to go down and along, the solved move keeps the along and none of the down but Box3D's
  // linear slop, 5 mm, which it leaves the mover into the plane so it does not jitter off it.
  const solved = solvePlanes([1, -1, 0], [{ plane: { normal: [0, 1, 0], offset: 0 }, pushLimit: Number.MAX_VALUE, push: 0, clipVelocity: true }])
  expect(solved.delta[0]).toBeCloseTo(1, 4)
  expect(solved.delta[1]).toBeCloseTo(-0.005, 4)
  expect(clipVector([2, -3, 1], [{ plane: { normal: [0, 1, 0], offset: 0 }, pushLimit: 1, push: 1, clipVelocity: true }])).toEqual([2, 0, 1])
})

test('contacts: a crate on the ground has a manifold whose normal is up, and whose points bear its weight', () => {
  const truth = boot(scene([{ is: 'crate', pos: [0, 0.5, 0] }]), sim)
  run(truth, 60)
  const w = wOf(truth)
  const c = of(truth, 'crate')[0]
  const cs = contacts(w, c)
  expect(cs.map(k => k.with)).toEqual([-1])
  const m = cs[0].manifolds[0]
  expect(Math.abs(m.normal[1])).toBeCloseTo(1, 3)
  // A point's normalImpulse is its last substep's: the four substeps of a step together bear the
  // weight for that step, m·g·dt.
  const total = m.points.reduce((sum, p) => sum + p.normalImpulse, 0) * 4
  expect(total / (1000 * G * DT)).toBeCloseTo(1, 2)
})

test('pointVelocity is v + ω×r; counters count the world', () => {
  const truth = boot(scene([{ is: 'crate', pos: [0, 5, 0], vel: [1, 0, 0], spin: [0, 0, 2] }], { gravity: [0, 0, 0], static: [] }), sim)
  run(truth, 1)
  const w = wOf(truth)
  const c = of(truth, 'crate')[0]
  const r = [0, 1, 0], [vx, vy, vz] = c.data.vel, [wx, wy, wz] = c.data.spin
  const expected = [vx + wy * r[2] - wz * r[1], vy + wz * r[0] - wx * r[2], vz + wx * r[1] - wy * r[0]]
  const got = pointVelocity(w, c, c.data.pos.map((x: number, k: number) => x + r[k]))
  got.forEach((x, k) => expect(x).toBeCloseTo(expected[k], 4))
  expect(counters(w).bodyCount).toBe(1)
})

// ---------------------------------------------------------------- staticAt and outline

test('staticAt: a point inside a static body\'s box, sphere or capsule, as the body is placed and turned in the world, and no other', () => {
  const plain = { static: [ground] }
  expect(staticAt(plain, [0, -0.5, 0])).toBe(true)
  expect(staticAt(plain, [19.9, -1.9, -19.9])).toBe(true)
  // On the ground's top, above it, and past its edge.
  expect(staticAt(plain, [0, 0, 0])).toBe(false)
  expect(staticAt(plain, [0, 0.5, 0])).toBe(false)
  expect(staticAt(plain, [20.1, -1, 0])).toBe(false)
  // A long thin wall along x, at x 10, turned a quarter about y so it runs along z.
  const q: [number, number, number, number] = [0, Math.SQRT1_2, 0, Math.SQRT1_2]
  const wall: Pick<World, 'static'> = { static: [{ pos: [10, 0, 0], rot: q, shapes: [{ box: [4, 1, 0.25] }] }] }
  expect(staticAt(wall, [10, 0, 3.9])).toBe(true)
  expect(staticAt(wall, [13.9, 0, 0])).toBe(false)
  expect(staticAt(wall, [10.2, 0, 0])).toBe(true)
  expect(staticAt(wall, [10.3, 0, 0])).toBe(false)
  // A ball and a rod, their shapes off their bodies' middles.
  const round: Pick<World, 'static'> = { static: [{ pos: [0, 5, 0], rot: [0, 0, 0, 1], shapes: [
    { sphere: { center: [0, 1, 0], radius: 0.5 } },
    { capsule: { center1: [2, 0, 0], center2: [4, 0, 0], radius: 0.25 } },
  ] }] }
  expect(staticAt(round, [0, 6.4, 0])).toBe(true)
  expect(staticAt(round, [0, 5.4, 0])).toBe(false)
  expect(staticAt(round, [3, 5.2, 0])).toBe(true)
  expect(staticAt(round, [4.2, 5, 0])).toBe(true)
  expect(staticAt(round, [4.3, 5, 0])).toBe(false)
  expect(staticAt(round, [1.8, 5, 0])).toBe(true)
  expect(staticAt(round, [3, 5.3, 0])).toBe(false)
})

test('outline: a shape as groups of points where it lies, each group a convex piece', () => {
  const list: Static[] = [
    { pos: [5, 0, 0], rot: [0, 0, 0, 1], shapes: [{ box: [1, 2, 3] }, { mesh: { positions: [0, 0, 0, 1, 0, 0, 0, 0, 1], indices: [0, 2, 1] } }] },
  ]
  const [box] = outline(list, 0, list[0].shapes[0])
  const xs = box.map(p => p[0]), ys = box.map(p => p[1]), zs = box.map(p => p[2])
  expect([Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys), Math.min(...zs), Math.max(...zs)].map(v => +v.toFixed(3))).toEqual([4, 6, -2, 2, -3, 3])
  const tris = outline(list, 0, list[0].shapes[1])
  expect(tris.length).toBe(1)
  expect(tris[0].map(p => p.map(v => +v.toFixed(3))).sort()).toEqual([[5, 0, 0], [5, 0, 1], [6, 0, 0]].sort())
})

// ---------------------------------------------------------------- the ground's chunks

// A manager and one child, `land`, booted by scenemanager's `load` so the child's `ground` mod,
// terrain3d's, is loaded as a game's is. Chunks are 8 heights a side 1 m apart, 7 m each. The child's
// `box3d` row lists no chunk; each test writes the list. `probe` hands the test the child's `w`.
const landField: Field = {
  program: { world: 200, hscale: 1, sea: 0.5, flood: false, out: 'hills', nodes: [{ id: 'hills', op: 'noise', kind: 'simplex', freq: 4, seed: 7 }] },
  analysis: { slopeStep: 1.5, curveStep: 4, positionRadius: 18, occlusionRadius: 30, occlusionSteps: 5, cliffProbe: 12, cliffSlope: 0.5, cliffDrop: 7, flatAngle: 0.03, records: 50000 },
  bands: [{ colour: '#3e5722', amount: 1, rules: [] }], grain: { base: 0.84, range: 0.32 }, detail: [], surfaces: {}, layers: [],
}
written('/box3d-sim-test/land.json', JSON.stringify(landField))
writeFileSync(join(folder, 'land.scene.json'), JSON.stringify({
  world: {
    loader: { assets: { land: { type: 'json', url: '/box3d-sim-test/land.json', preload: true } } },
    terrain3d: { field: 'land' },
    box3d: { ...world(), static: [], mods: { ground: 'terrain3d' }, chunk: { count: 8, cell: 1 } },
  },
  prefabs: { engine: { dt: DT, width: 320, height: 200 }, scenemanager: { out: {} }, loader: {}, box3d: {}, crate: at([3.5, 0, 3.5]), probe: {} },
  actors: [{ is: 'scenemanager' }, { is: 'loader' }, { is: 'box3d' }, { is: 'probe' }],
  plugins: ['scenemanager'],
}))
const from = (p: string) => JSON.stringify(new URL(p, import.meta.url).pathname)
writeFileSync(join(folder, 'land.sim.ts'), `
import { scenemanager } from ${from('../scenemanager/scenemanager.sim.ts')}
import { loader } from ${from('../loader/loader.sim.ts')}
import { box3d } from ${from('./box3d.sim.ts')}
import file from './land.scene.json' with { type: 'json' }
export const sim = { scenemanager, loader, box3d, crate: {}, probe: { after(_me, _dt, w) { globalThis.land = w } } }
export const scene = file
`)
const manager: Scene = {
  prefabs: { engine: { dt: DT }, scenemanager: { scenes: { land: { file: 'land.scene.json', suspend: false } }, dt: DT, entry: 'land', port: 0 } },
  actors: [{ is: 'scenemanager' }], plugins: ['scenemanager'], seats: 1,
}
const land = async () => (await load(boot(structuredClone(manager), { scenemanager }), pathToFileURL(folder + '/').href)).get('land')!
const bodyCount = (truth: Truth) => { run(truth, 0); return counters((globalThis as any).land).bodyCount }

test('ground: listing a key builds that chunk, and a crate dropped on it rests there on terrain3d\'s height', async () => {
  const truth = await land()
  truth.rows.find(r => r.kind === 'box3d')!.data.ground = [[0, 0]]
  run(truth, 1)
  const w = (globalThis as any).land
  const y = heightAt(w, 3.5, 3.5)
  const ball = truth.spawn('crate', { pos: [3.5, y + 2, 3.5] })
  run(truth, 240)
  expect(ball.data.awake).toBe(false)
  expect(Math.abs(ball.data.pos[1] - (y + 0.5))).toBeLessThan(0.25)
  expect(castRayClosest(w, [3.5, 50, 3.5], [0, -100, 0])!.id).toBe(ball.id)
})

test('ground: unlisting a key drops its chunk, and what rested on it falls', async () => {
  const truth = await land()
  const row = truth.rows.find(r => r.kind === 'box3d')!
  row.data.ground = [[0, 0], [1, 0]]
  run(truth, 1)
  const ball = truth.spawn('crate', { pos: [3.5, heightAt((globalThis as any).land, 3.5, 3.5) + 1, 3.5] })
  run(truth, 240)
  const rested = ball.data.pos[1], before = bodyCount(truth)
  row.data.ground = [[1, 0]]
  run(truth, 60)
  expect(bodyCount(truth)).toBe(before - 1)
  expect(ball.data.pos[1]).toBeLessThan(rested - 5)
})

test('ground: a key listed for 100 steps is built once: a crate resting on it sleeps through all 100', async () => {
  const truth = await land()
  truth.rows.find(r => r.kind === 'box3d')!.data.ground = [[0, 0]]
  run(truth, 1)
  const ball = truth.spawn('crate', { pos: [3.5, heightAt((globalThis as any).land, 3.5, 3.5) + 1, 3.5] })
  run(truth, 240)
  expect(ball.data.awake).toBe(false)
  const still = JSON.stringify(ball.data)
  for (let i = 0; i < 100; i++) {
    truth.step(DT)
    expect(JSON.stringify(ball.data)).toBe(still)
  }
})
