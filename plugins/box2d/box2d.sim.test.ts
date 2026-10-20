// box2d's Box2D world. The test writes its own scenes: `world.box2d` is a static ground whose top is
// y = 0 and the body kinds `crate` (a box), `ball` (a circle), `rod` (a capsule) and `lift` (a
// kinematic box), with `note`, a kind with the same fields that box2d does not list; a test adds the
// kinds and joints it needs over that. A write the test makes to a row between steps is what an act
// would write.
//
// What is tested is box2d's wiring, never Box2D's physics: that a field of the scene or a row
// reaches Box2D, read back through Box2D's own getters on `bodyOf` and `jointOf`; that what Box2D
// says reaches the row, the same floats a world driven by hand with the same calls holds; that
// Box2D's events and queries come back in row ids; and that two runs land on the same bytes and the
// same b2World_GetStateHash. Where a thing Box2D does is only seen in what the bodies do, the test
// holds it to having changed what they do, and to nothing finer.
import { expect, test } from 'vitest'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { boot, type Row, type Scene, type Sim, type Truth, type W } from '#engine/engine.ts'
import { jsonAt, loader, written } from '#plugins/loader/loader.sim.ts'
import { dial, serve } from '#addons/socket/socket.addon.ts'
import {
  b2, bodyOf, box2d, boundsOf, castMover, castRay, castRayClosest, castShape, clipVector, collideMover, contacts, counters,
  jointOf, massOf, outline, overlapAABB, overlapShape, pointVelocity, solvePlanes, stateHash, staticAt,
  type Body, type Geometry, type Joint, type Shape, type Static, type World,
} from './box2d.sim.ts'

const DT = 1 / 60

const body = (shape: Geometry, over: Partial<Body> = {}): Body => ({ type: 'dynamic', shapes: [{ ...shape, density: 1 } as Shape], ...over })
const at = (pos: number[]) => ({ pos, rot: [1, 0], vel: [0, 0], spin: 0, awake: true })
const ground: Static = { pos: [0, -1], rot: [1, 0], shapes: [{ box: [20, 1] }] }

const world = (over: Partial<World> = {}): World => ({
  gravity: [0, -10], subStepCount: 4,
  ...over,
  static: over.static ?? [ground],
  kinds: {
    crate: body({ box: [0.5, 0.5] }),
    ball: body({ circle: { center: [0, 0], radius: 0.3 } }),
    rod: body({ capsule: { center1: [-0.5, 0], center2: [0.5, 0], radius: 0.25 } }),
    lift: { ...body({ box: [1, 0.25] }), type: 'kinematic' },
    ...over.kinds,
  },
})

// A scene of the kinds above and whatever more the test lists: `prefabs` for its own kinds' rows.
const scene = (actors: Scene['actors'], over?: Partial<World>, prefabs: Record<string, any> = {}): Scene => ({
  world: { box2d: world(over) },
  prefabs: {
    box2d: {},
    crate: at([0, 0.5]), ball: at([0, 0.3]), rod: at([0, 0.25]), lift: at([0, 0.25]), note: at([0, 5]),
    asker: {},
    ...prefabs,
  },
  actors: [{ is: 'box2d' }, ...actors],
})

// A rule's `w` on a truth, for the queries: an `asker` row, spawned the first time, keeps the `w`
// its `after` hook is handed, which is the truth's own and holds for every step after.
let asked: W | undefined
const asker = { after(_me: Row, _dt: number, w: W) { asked = w } }
function wOf(truth: Truth): W {
  asked = undefined
  if (!of(truth, 'asker').length) truth.spawn('asker')
  truth.step(DT)
  return asked!
}

const kinds = ['crate', 'ball', 'rod', 'lift', 'note']
const simOf = (more: string[] = []): Sim => ({ box2d, asker, ...Object.fromEntries([...kinds, ...more].map(k => [k, {}])) })
const sim = simOf()
const run = (truth: Truth, k: number) => { for (let i = 0; i < k; i++) truth.step(DT) }
const of = (truth: Truth, kind: string) => truth.rows.filter(r => r.kind === kind)
const bytes = (t: Truth) => JSON.stringify(t.rows.map((r: Row) => [r.id, r.kind, r.data]))
const shapeOf = (id: ReturnType<typeof bodyOf>) => { const v = b2.b2Body_GetShapes(id); const s = v.get(0)!; v.delete(); return s }

// A crate on a crate on the ground, and a ball thrown at them.
const tipped = () => boot(scene([{ is: 'crate', pos: [0, 0.5] }, { is: 'crate', pos: [0, 1.5] }, { is: 'ball', pos: [-3, 1.6], vel: [15, 0] }]), sim)

// ---------------------------------------------------------------- the world and its rows

// What the server says, as the page hears it across a real socket (`addons/socket`).
async function across<T>(said: T): Promise<T> {
  const server = await serve<never, T>(0, send => { send(said); return { take() {}, close() {} } })
  const heard = await new Promise<T>(r => { const page = dial<never, T>(`ws://localhost:${server.port}`)(d => { page.close(); r(d) }) })
  await server.close()
  return heard
}

// A page that runs a scene ahead joins while a ball knocks a stack over. The server saves its truth
// and box2d hands out its world beside it (`hold`), the world as Box2D's own image of bytes, and both
// cross a real socket; the page loads the save into a truth of its own and box2d takes the world
// (`take`). From then on both step alike to the bit, and the server, which only handed its world out,
// steps exactly as a server nobody joined. Without the world, from the rows alone, the page parts
// from the server.
test('a truth loaded from a save, given what box2d held beside it, steps exactly as the server, a stack falling between', async () => {
  const joined = async (memory: boolean) => {
    const alone = tipped()
    const server = tipped()
    run(alone, 20)
    run(server, 20)
    const box = server.rows.find(r => r.kind === 'box2d')!
    const sent = await across({ save: server.save(), held: box2d.hold!(box) as { image: Uint8Array } })
    const page = tipped()
    page.load(sent.save)
    if (memory) box2d.take!(page.rows.find(r => r.kind === 'box2d')!, sent.held)
    let parted = 0
    for (let i = 0; i < 120; i++) {
      alone.step(DT)
      server.step(DT)
      page.step(DT)
      expect(bytes(server)).toBe(bytes(alone))
      if (bytes(page) !== bytes(server)) parted++
    }
    return parted
  }
  expect(await joined(true)).toBe(0)
  expect(await joined(false)).toBeGreaterThan(0)
})

test('what Box2D holds is what the rows carry: the same floats a world driven by hand with the same calls holds', () => {
  const truth = boot(scene([{ is: 'crate', pos: [0.2, 3], rot: [Math.cos(0.4), Math.sin(0.4)], spin: 2 }]), sim)
  run(truth, 90)
  // The same world by hand: Box2D's defaults, the ground, and the crate as its row starts.
  const def = b2.b2DefaultWorldDef()
  def.gravity = [0, -10]
  const hand = b2.b2CreateWorld(def)
  const gd = b2.b2DefaultBodyDef()
  gd.position = [0, -1]
  b2.b2CreatePolygonShape(b2.b2CreateBody(hand, gd), b2.b2DefaultShapeDef(), b2.b2MakeOffsetRoundedBox(20, 1, [0, 0], [1, 0], 0))
  const bd = b2.b2DefaultBodyDef()
  bd.type = b2.b2BodyType.b2_dynamicBody
  bd.position = [0.2, 3]
  bd.rotation = [Math.cos(0.4), Math.sin(0.4)]
  bd.angularVelocity = 2
  const crate = b2.b2CreateBody(hand, bd)
  const sd = b2.b2DefaultShapeDef()
  sd.density = 1
  b2.b2CreatePolygonShape(crate, sd, b2.b2MakeOffsetRoundedBox(0.5, 0.5, [0, 0], [1, 0], 0))
  for (let i = 0; i < 90; i++) b2.b2World_Step(hand, DT, 4)
  const row = of(truth, 'crate')[0].data
  expect(row.pos).toEqual(b2.b2Body_GetPosition([0, 0], crate))
  expect(row.rot).toEqual(b2.b2Body_GetRotation([1, 0], crate))
  expect(row.vel).toEqual(b2.b2Body_GetLinearVelocity([0, 0], crate))
  expect(row.spin).toBe(b2.b2Body_GetAngularVelocity(crate))
  expect(row.awake).toBe(b2.b2Body_IsAwake(crate))
  b2.b2DestroyWorld(hand)
})

test('truths of one scene step apart from each other and land on the same bytes and the same state hash', () => {
  const alone = tipped()
  run(alone, 200)
  const a = tipped(), b = tipped()
  for (let i = 0; i < 200; i++) { a.step(DT); b.step(DT) }
  expect(bytes(a)).toBe(bytes(alone))
  expect(bytes(b)).toBe(bytes(alone))
  expect(stateHash(wOf(a))).toBe(stateHash(wOf(b)))
})

test('a body\'s fixed numbers are world.box2d\'s, never its row\'s: the box2d row a scene starts is empty', () => {
  const truth = tipped()
  run(truth, 5)
  expect(of(truth, 'box2d')[0].data).toEqual({})
})

test('a field world.box2d and a kind leave out is Box2D\'s own default', () => {
  const truth = boot({ world: { box2d: { subStepCount: 4, static: [], kinds: { crate: { shapes: [{ box: [0.5, 0.5] }] } } } }, prefabs: { box2d: {}, crate: at([0, 0]), asker: {} }, actors: [{ is: 'box2d' }, { is: 'crate' }] }, sim)
  const w = wOf(truth)
  const id = bodyOf(w, of(truth, 'crate')[0])
  const wd = b2.b2DefaultWorldDef(), bd = b2.b2DefaultBodyDef(), sd = b2.b2DefaultShapeDef()
  expect(b2.b2World_GetGravity([0, 0], b2.b2Body_GetWorld(id))).toEqual(wd.gravity)
  expect(b2.b2Body_GetType(id)).toBe(bd.type)
  expect(b2.b2Body_GetLinearDamping(id)).toBe(bd.linearDamping)
  expect(b2.b2Body_GetGravityScale(id)).toBe(bd.gravityScale)
  expect(b2.b2Body_GetSleepThreshold(id)).toBe(bd.sleepThreshold)
  const s = shapeOf(id)
  expect(b2.b2Shape_GetDensity(s)).toBe(sd.density)
  expect(b2.b2Shape_GetFriction(s)).toBe(sd.material.friction)
  expect(b2.b2Shape_GetFilter(s)).toEqual(sd.filter)
})

test('world.box2d\'s fields reach the world, and the box2d row\'s live ones are the live world\'s', () => {
  const truth = boot(scene([{ is: 'crate' }], { gravity: [1, -3], restitutionThreshold: 2, hitEventThreshold: 3, maximumLinearSpeed: 50, enableSleep: false, enableContinuous: false, enableWarmStarting: false, contactRecycleDistance: 0.2 }), sim)
  const w = wOf(truth)
  const world = b2.b2Body_GetWorld(bodyOf(w, of(truth, 'crate')[0]))
  expect(b2.b2World_GetGravity([0, 0], world)).toEqual([1, -3])
  expect(b2.b2World_GetRestitutionThreshold(world)).toBe(2)
  expect(b2.b2World_GetHitEventThreshold(world)).toBe(3)
  expect(b2.b2World_GetMaximumLinearSpeed(world)).toBe(50)
  expect(b2.b2World_IsSleepingEnabled(world)).toBe(false)
  expect(b2.b2World_IsContinuousEnabled(world)).toBe(false)
  expect(b2.b2World_IsWarmStartingEnabled(world)).toBe(false)
  expect(b2.b2World_GetContactRecycleDistance(world)).toBeCloseTo(0.2, 6)
  const row = of(truth, 'box2d')[0]
  Object.assign(row.data, { gravity: [0, -20], restitutionIterations: 3, enableRestitutionPropagation: true, enableSleep: true, maximumLinearSpeed: 9 })
  run(truth, 1)
  expect(b2.b2World_GetGravity([0, 0], world)).toEqual([0, -20])
  expect(b2.b2World_GetRestitutionIterations(world)).toBe(3)
  expect(b2.b2World_IsRestitutionPropagationEnabled(world)).toBe(true)
  expect(b2.b2World_IsSleepingEnabled(world)).toBe(true)
  expect(b2.b2World_GetMaximumLinearSpeed(world)).toBe(9)
})

test('the box2d row\'s subStepCount is the one the world steps with', () => {
  const four = tipped(), eight = tipped(), row = tipped()
  of(eight, 'box2d')[0].data.subStepCount = 8
  of(row, 'box2d')[0].data.subStepCount = 8
  const d = eight.world.box2d as World
  d.subStepCount = 8
  run(four, 60); run(eight, 60); run(row, 60)
  expect(bytes(row)).toBe(bytes(eight))
  expect(bytes(row)).not.toBe(bytes(four))
})

// ---------------------------------------------------------------- bodies

test('a row spawned of a listed kind is a body from the next step, and a kind the table leaves out is never touched', () => {
  const truth = boot(scene([{ is: 'note' }]), sim)
  run(truth, 30)
  expect(of(truth, 'note')[0].data).toEqual(at([0, 5]))
  const crate = truth.spawn('crate', { pos: [0, 4] })
  run(truth, 1)
  expect(crate.data.pos[1]).toBeLessThan(4)
  expect(() => bodyOf(wOf(truth), crate)).not.toThrow()
})

test('a body whose row ends leaves the world', () => {
  const truth = tipped()
  const w = wOf(truth)
  const before = counters(w).bodyCount
  truth.end(of(truth, 'ball')[0])
  run(truth, 1)
  expect(counters(w).bodyCount).toBe(before - 1)
})

test('what a rule writes into pos, rot, vel, spin and awake is where the body is and how it moves', () => {
  const truth = boot(scene([{ is: 'crate', pos: [0, 5] }], {}, { crate: { ...at([0, 5]) } }), simOf())
  const w = wOf(truth)
  const row = of(truth, 'crate')[0]
  const id = bodyOf(w, row)
  row.data.pos = [3, 7]
  row.data.rot = [0, 1]
  row.data.vel = [2, 1]
  row.data.spin = -1.5
  b2.b2Body_SetGravityScale(id, 0)
  // One step moves it by the velocity Box2D was given, from where it was put.
  run(truth, 1)
  expect(row.data.vel).toEqual(b2.b2Body_GetLinearVelocity([0, 0], id))
  expect(row.data.pos[0]).toBeGreaterThan(3)
  expect(row.data.pos[1]).toBeGreaterThan(7)
  expect(row.data.spin).toBe(b2.b2Body_GetAngularVelocity(id))
  row.data.awake = false
  run(truth, 1)
  expect(b2.b2Body_IsAwake(id)).toBe(false)
  expect(row.data.awake).toBe(false)
  row.data.awake = true
  run(truth, 1)
  expect(row.data.awake).toBe(true)
})

test('a live setting on the row is the body\'s over its kind\'s, and changes it while it runs', () => {
  const truth = boot(scene([{ is: 'crate', pos: [0, 3] }]), sim)
  const w = wOf(truth)
  const row = of(truth, 'crate')[0], id = bodyOf(w, row)
  Object.assign(row.data, {
    linearDamping: 0.5, angularDamping: 0.25, gravityScale: 2, sleepThreshold: 0.1, safetyFactor: 0.4, motionLocks: { angularZ: true },
    enableSleep: false, isBullet: true, enableContactRecycling: false, name: 'box',
  })
  run(truth, 1)
  expect(b2.b2Body_GetLinearDamping(id)).toBe(0.5)
  expect(b2.b2Body_GetAngularDamping(id)).toBe(0.25)
  expect(b2.b2Body_GetGravityScale(id)).toBe(2)
  expect(b2.b2Body_GetSleepThreshold(id)).toBeCloseTo(0.1, 6)
  expect(b2.b2Body_GetSafetyFactor(id)).toBeCloseTo(0.4, 6)
  expect(b2.b2Body_GetMotionLocks(id)).toEqual({ linearX: false, linearY: false, angularZ: true })
  expect(b2.b2Body_IsSleepEnabled(id)).toBe(false)
  expect(b2.b2Body_IsBullet(id)).toBe(true)
  expect(b2.b2Body_IsContactRecyclingEnabled(id)).toBe(false)
  expect(b2.b2Body_GetName(id)).toBe('box')
  row.data.type = 'kinematic'
  row.data.enabled = false
  run(truth, 1)
  expect(b2.b2Body_GetType(id)).toBe(b2.b2BodyType.b2_kinematicBody)
  expect(b2.b2Body_IsEnabled(id)).toBe(false)
})

test('a kind\'s Body fields reach its bodies, and its mass data replaces what its shapes\' densities give', () => {
  const mass = { mass: 7, center: [0.1, 0] as [number, number], rotationalInertia: 3 }
  const truth = boot(scene([{ is: 'heavy' }], { kinds: { heavy: body({ box: [0.5, 0.5] }, { linearDamping: 0.3, allowFastRotation: true, enableSleep: false, mass, name: 'heavy' }) } }, { heavy: at([0, 2]) }), simOf(['heavy']))
  const w = wOf(truth)
  const row = of(truth, 'heavy')[0], id = bodyOf(w, row)
  expect(b2.b2Body_GetLinearDamping(id)).toBeCloseTo(0.3, 6)
  expect(b2.b2Body_IsSleepEnabled(id)).toBe(false)
  expect(b2.b2Body_GetName(id)).toBe('heavy')
  expect(massOf(w, row).mass).toBe(7)
  expect(massOf(w, row).center[0]).toBeCloseTo(0.1, 6)
})

test('force, torque, pushes, target and wind each reach the body; pushes go once taken', () => {
  const floating = { ...body({ box: [0.5, 0.5] }), gravityScale: 0 }
  const make = () => boot(scene([{ is: 'float', pos: [0, 5] }, { is: 'float', pos: [5, 5] }], { kinds: { float: floating } }, { float: at([0, 5]) }), simOf(['float']))
  const still = make()
  run(still, 2)
  const stay = of(still, 'float')[1].data
  for (const [field, value] of [['force', [30, 0]], ['torque', 5], ['pushes', [{ impulse: [1, 0], angular: 0.5 }]], ['wind', { wind: [20, 0], drag: 1, lift: 0 }]] as const) {
    const truth = make()
    const [moved, other] = of(truth, 'float')
    moved.data[field] = structuredClone(value)
    run(truth, 2)
    expect(moved.data.vel[0] !== 0 || moved.data.spin !== 0, field).toBe(true)
    expect(other.data).toEqual(stay)
    if (field === 'pushes') expect(moved.data.pushes).toBeUndefined()
    else expect(moved.data[field]).toEqual(value)
  }
  const lift = boot(scene([{ is: 'lift', pos: [0, 2] }]), sim)
  of(lift, 'lift')[0].data.target = { pos: [1, 3], rot: [1, 0] }
  run(lift, 1)
  const p = of(lift, 'lift')[0].data.pos
  expect(p[0]).toBeCloseTo(1, 4)
  expect(p[1]).toBeCloseTo(3, 4)
})

// ---------------------------------------------------------------- shapes

test('every geometry is the shape Box2D makes of its numbers', () => {
  const hull = b2.b2ComputeHull([-1, 0, 1, 0, 0, 1.5])
  const shapes: [Geometry, (s: ReturnType<typeof shapeOf>) => void][] = [
    [{ circle: { center: [0.1, 0.2], radius: 0.4 } }, s => expect(b2.b2Shape_GetCircle(s).radius).toBeCloseTo(0.4, 6)],
    [{ capsule: { center1: [-0.5, 0], center2: [0.5, 0], radius: 0.2 } }, s => expect(b2.b2Shape_GetCapsule(s).center2).toEqual([0.5, 0])],
    [{ segment: { point1: [-1, 0], point2: [1, 0.5] } }, s => expect(b2.b2Shape_GetSegment(s).point2).toEqual([1, 0.5])],
    [{ box: [0.5, 0.25] }, s => expect(b2.b2Shape_GetPolygon(s)).toEqual(b2.b2MakeBox(0.5, 0.25))],
    [{ box: [0.5, 0.25], pos: [1, 0], rot: [0, 1], radius: 0.1 }, s => expect(b2.b2Shape_GetPolygon(s)).toEqual(b2.b2MakeOffsetRoundedBox(0.5, 0.25, [1, 0], [0, 1], 0.1))],
    [{ polygon: { points: [-1, 0, 1, 0, 0, 1.5] } }, s => expect(b2.b2Shape_GetPolygon(s)).toEqual(b2.b2MakePolygon(hull, 0))],
    [{ polygon: { points: [-1, 0, 1, 0, 0, 1.5] }, pos: [0, 1], radius: 0.05 }, s => expect(b2.b2Shape_GetPolygon(s)).toEqual(b2.b2MakeOffsetRoundedPolygon(hull, [0, 1], [1, 0], 0.05))],
  ]
  for (const [g, check] of shapes) {
    const truth = boot(scene([{ is: 'thing', pos: [0, 3] }], { kinds: { thing: body(g) } }, { thing: at([0, 3]) }), simOf(['thing']))
    check(shapeOf(bodyOf(wOf(truth), of(truth, 'thing')[0])))
  }
})

test('a polygon of more points than Box2D holds, or none it can hull, is refused, and says so', () => {
  const nine = Array.from({ length: 9 }, (_, i) => [Math.cos(i * 0.7), Math.sin(i * 0.7)]).flat()
  for (const points of [nine, [0, 0, 1, 0, 2, 0]]) {
    const truth = boot(scene([{ is: 'thing' }], { kinds: { thing: body({ polygon: { points } }) } }, { thing: at([0, 3]) }), simOf(['thing']))
    expect(() => run(truth, 1)).toThrow(/hull/)
  }
})

test('a chain is Box2D\'s chain of its points, one segment shape each, and a ray meets it where its points are', () => {
  const chain: Static = { pos: [0, 0], rot: [1, 0], shapes: [{ chain: { points: [4, 0, 0, 1, -4, 0], isLoop: false, ghost1: [5, 0], ghost2: [-5, 0] }, material: { friction: 0.2 } }] }
  const truth = boot(scene([], { static: [chain] }), sim)
  const w = wOf(truth)
  const hit = castRayClosest(w, [0, 5], [0, -10])!
  expect(hit.id).toBe(-1)
  expect(hit.point[1]).toBeCloseTo(1, 5)
  expect(counters(w).shapeCount).toBe(2)
})

test('a chain may be a data file of the scene\'s loader catalogue', async () => {
  const url = '/box2d-sim-test/ridge.json'
  written(url, JSON.stringify({ points: [6, 0, 0, 2, -6, 0], isLoop: false, ghost1: [7, 0], ghost2: [-7, 0] }))
  await jsonAt('ridge', url)
  const ridge: Static = { pos: [0, 0], rot: [1, 0], shapes: [{ chain: { asset: 'ridge' } }] }
  const s = scene([], { static: [ridge] })
  s.world!.loader = { assets: { ridge: { type: 'json', url, preload: true } } }
  s.prefabs.loader = {}
  s.actors.unshift({ is: 'loader' })
  const truth = boot(s, { ...sim, loader })
  const w = wOf(truth)
  expect(castRayClosest(w, [0, 5], [0, -10])!.point[1]).toBeCloseTo(2, 5)
  expect(outline([ridge], 0, ridge.shapes[0], w)).toHaveLength(2)
  expect(() => outline([{ ...ridge }], 0, ridge.shapes[0])).toThrow(/through the loader/)
})

test('a shape\'s material, filter and switches reach Box2D', () => {
  const shape: Shape = {
    box: [0.5, 0.5], density: 3, material: { friction: 0.1, restitution: 0.7, rollingResistance: 0.2, tangentSpeed: 1, userMaterialId: 9, customColor: 0xff0000 },
    filter: { categoryBits: 2, maskBits: 5, groupIndex: -3 }, enableSensorEvents: true, enableContactEvents: false, enableHitEvents: true, enablePreSolveEvents: true,
  }
  const truth = boot(scene([{ is: 'thing', pos: [0, 3] }], { kinds: { thing: { type: 'dynamic', shapes: [shape] } } }, { thing: at([0, 3]) }), simOf(['thing']))
  const s = shapeOf(bodyOf(wOf(truth), of(truth, 'thing')[0]))
  expect(b2.b2Shape_GetDensity(s)).toBe(3)
  expect(b2.b2Shape_GetSurfaceMaterial(s)).toEqual({ friction: expect.closeTo(0.1, 6), restitution: expect.closeTo(0.7, 6), rollingResistance: expect.closeTo(0.2, 6), tangentSpeed: 1, userMaterialId: 9n, customColor: 0xff0000 })
  expect(b2.b2Shape_GetFilter(s)).toEqual({ categoryBits: 2n, maskBits: 5n, groupIndex: -3 })
  expect(b2.b2Shape_AreSensorEventsEnabled(s)).toBe(true)
  expect(b2.b2Shape_AreContactEventsEnabled(s)).toBe(false)
  expect(b2.b2Shape_AreHitEventsEnabled(s)).toBe(true)
  expect(b2.b2Shape_ArePreSolveEventsEnabled(s)).toBe(true)
})

// ---------------------------------------------------------------- events

test('contact events: a body that asks is told who it touches, the ground as -1, and no more once it lifts off', () => {
  const truth = boot(scene([{ is: 'feeler', pos: [0, 1] }], { kinds: { feeler: { type: 'dynamic', shapes: [{ box: [0.5, 0.5], density: 1, enableContactEvents: true }] } } }, { feeler: at([0, 1]) }), simOf(['feeler']))
  const row = of(truth, 'feeler')[0]
  run(truth, 60)
  expect(row.data.touching).toEqual([-1])
  // Box2D moves a sleeping body where it is put and leaves it asleep, so the rule wakes it too.
  row.data.pos = [0, 10]
  row.data.awake = true
  run(truth, 2)
  expect(row.data.touching).toBeUndefined()
})

test('hit events: a body that asks is told of an impact, the thing it struck, where, and how fast', () => {
  const truth = boot(scene([{ is: 'striker', pos: [0, 3], vel: [0, -10] }], { kinds: { striker: { type: 'dynamic', shapes: [{ circle: { center: [0, 0], radius: 0.3 }, density: 1, enableHitEvents: true }] } } }, { striker: at([0, 3]) }), simOf(['striker']))
  const row = of(truth, 'striker')[0]
  let hits: any
  for (let i = 0; i < 60 && !hits; i++) { truth.step(DT); hits = row.data.hits }
  expect(hits).toHaveLength(1)
  expect(hits[0].with).toBe(-1)
  expect(hits[0].speed).toBeGreaterThan(0)
  expect(hits[0].normal[1]).toBeGreaterThan(0)
  run(truth, 1)
  expect(row.data.hits).toBeUndefined()
})

test('sensor events: a sensor names the bodies inside it while they are', () => {
  const kinds = {
    gate: { type: 'static', shapes: [{ box: [1, 1], isSensor: true, enableSensorEvents: true }] } as Body,
    visitor: { type: 'dynamic', shapes: [{ circle: { center: [0, 0], radius: 0.2 }, density: 1, enableSensorEvents: true }] } as Body,
  }
  const truth = boot(scene([{ is: 'gate', pos: [0, 3] }, { is: 'visitor', pos: [0, 6] }], { kinds }, { gate: at([0, 3]), visitor: at([0, 6]) }), simOf(['gate', 'visitor']))
  const [gate, visitor] = [of(truth, 'gate')[0], of(truth, 'visitor')[0]]
  let seen = false
  for (let i = 0; i < 120; i++) { truth.step(DT); if (gate.data.visitors?.includes(visitor.id)) seen = true }
  expect(seen).toBe(true)
  expect(gate.data.visitors).toBeUndefined()
})

test('oneWay: a ball thrown up through a platform passes it, then lands on it', () => {
  const platform: Static = { pos: [0, 2], rot: [1, 0], shapes: [{ box: [2, 0.1], oneWay: [0, 1] }] }
  const truth = boot(scene([{ is: 'ball', pos: [0, 0.3], vel: [0, 12] }], { static: [ground, platform] }), sim)
  const ball = of(truth, 'ball')[0]
  let top = 0
  for (let i = 0; i < 180; i++) { truth.step(DT); top = Math.max(top, ball.data.pos[1]) }
  expect(top).toBeGreaterThan(2.4)
  expect(ball.data.pos[1]).toBeGreaterThan(2)
})

// ---------------------------------------------------------------- joints

const ends = (a: number, b: number) => ({ a, b })
const JOINTS: Record<string, Joint> = {
  distance: { type: 'distance', length: 2, enableSpring: true, hertz: 2 },
  filter: { type: 'filter' },
  motor: { type: 'motor', maxVelocityForce: 100 },
  mover: { type: 'mover', maxVelocityForce: [50, 50] },
  pogo: { type: 'pogo', restLength: 1, hertz: 3 },
  prismatic: { type: 'prismatic', enableLimit: true, lowerTranslation: -1, upperTranslation: 1 },
  revolute: { type: 'revolute', enableMotor: true, maxMotorTorque: 10, motorSpeed: 1 },
  weld: { type: 'weld', linearHertz: 5 },
  wheel: { type: 'wheel', enableSpring: true, hertz: 4, enableMotor: true, maxMotorTorque: 5 },
}
const TYPES: Record<string, number> = {
  distance: b2.b2JointType.b2_distanceJoint.value, filter: b2.b2JointType.b2_filterJoint.value, motor: b2.b2JointType.b2_motorJoint.value,
  mover: b2.b2JointType.b2_moverJoint.value, pogo: b2.b2JointType.b2_pogoJoint.value, prismatic: b2.b2JointType.b2_prismaticJoint.value,
  revolute: b2.b2JointType.b2_revoluteJoint.value, weld: b2.b2JointType.b2_weldJoint.value, wheel: b2.b2JointType.b2_wheelJoint.value,
}
const jointed = (kind: string, j: Joint, row: Record<string, unknown> = {}) => {
  const truth = boot(scene([{ is: 'crate', pos: [0, 3] }, { is: 'crate', pos: [2, 3] }], { joints: { [kind]: j } }, { [kind]: {} }), simOf([kind]))
  const [c1, c2] = of(truth, 'crate')
  const joint = truth.spawn(kind, { ...ends(c1.id, c2.id), ...row })
  return { truth, joint, w: wOf(truth) }
}

test('every type of joint is made from its kind, of Box2D\'s type, and reads out under its getters\' names', () => {
  const reads: Record<string, string[]> = { distance: ['currentLength', 'springForce', 'motorForce'], pogo: ['length', 'velocity', 'impulse'], prismatic: ['translation', 'speed', 'motorForce'], revolute: ['angle', 'motorTorque'], wheel: ['motorTorque'] }
  for (const [type, j] of Object.entries(JOINTS)) {
    const { truth, joint, w } = jointed(type, j)
    run(truth, 3)
    expect(b2.b2Joint_GetType(jointOf(w, joint)).value, type).toBe(TYPES[type])
    expect(Object.keys(joint.data.measured).sort()).toEqual(['angularSeparation', 'constraintForce', 'constraintTorque', 'linearSeparation', ...reads[type] ?? []].sort())
  }
  const { joint, w } = jointed('revolute', JOINTS.revolute)
  expect(joint.data.measured.angle).toBe(b2.b2RevoluteJoint_GetAngle(jointOf(w, joint)))
})

test('a joint kind\'s fields and frames reach Box2D, and a row\'s live ones change the joint while it runs', () => {
  const { truth, joint, w } = jointed('revolute', { ...JOINTS.revolute, localFrameA: { pos: [1, 0], rot: [1, 0] }, localFrameB: { pos: [-1, 0], rot: [1, 0] }, collideConnected: true, forceThreshold: 50 })
  const id = jointOf(w, joint)
  expect(b2.b2Joint_GetLocalFrameA([0, 0], [1, 0], id)).toEqual([[1, 0], [1, 0]])
  expect(b2.b2Joint_GetCollideConnected(id)).toBe(true)
  expect(b2.b2Joint_GetForceThreshold(id)).toBe(50)
  expect(b2.b2RevoluteJoint_GetMotorSpeed(id)).toBe(1)
  Object.assign(joint.data, { motorSpeed: 3, lowerAngle: -0.5, upperAngle: 0.5, enableLimit: true, constraintHertz: 30, constraintDampingRatio: 2 })
  run(truth, 1)
  expect(b2.b2RevoluteJoint_GetMotorSpeed(id)).toBe(3)
  expect(b2.b2RevoluteJoint_IsLimitEnabled(id)).toBe(true)
  expect(b2.b2RevoluteJoint_GetLowerLimit(id)).toBeCloseTo(-0.5, 6)
  expect(b2.b2RevoluteJoint_GetUpperLimit(id)).toBeCloseTo(0.5, 6)
  expect(b2.b2Joint_GetConstraintTuning(id)).toEqual({ hertz: 30, dampingRatio: 2 })
})

test('each type\'s live fields reach Box2D', () => {
  const cases: [string, Record<string, unknown>, (id: ReturnType<typeof jointOf>) => unknown[], unknown[]][] = [
    ['distance', { length: 3, minLength: 1, maxLength: 4, enableLimit: true, motorSpeed: 2, maxMotorForce: 7 }, id => [b2.b2DistanceJoint_GetLength(id), b2.b2DistanceJoint_GetMinLength(id), b2.b2DistanceJoint_GetMaxLength(id), b2.b2DistanceJoint_GetMotorSpeed(id), b2.b2DistanceJoint_GetMaxMotorForce(id)], [3, 1, 4, 2, 7]],
    ['motor', { linearVelocity: [1, 2], angularVelocity: 0.5, maxVelocityTorque: 4 }, id => [b2.b2MotorJoint_GetLinearVelocity([0, 0], id), b2.b2MotorJoint_GetAngularVelocity(id), b2.b2MotorJoint_GetMaxVelocityTorque(id)], [[1, 2], 0.5, 4]],
    ['mover', { linearVelocity: [3, 0], maxVelocityForce: [9, 8] }, id => [b2.b2MoverJoint_GetLinearVelocity([0, 0], id), b2.b2MoverJoint_GetMaxVelocityForce([0, 0], id)], [[3, 0], [9, 8]]],
    ['pogo', { restLength: 2, hertz: 5, dampingRatio: 0.5 }, id => [b2.b2PogoJoint_GetRestLength(id), b2.b2PogoJoint_GetSpringHertz(id), b2.b2PogoJoint_GetSpringDampingRatio(id)], [2, 5, 0.5]],
    ['prismatic', { motorSpeed: 2, maxMotorForce: 3, lowerTranslation: -2 }, id => [b2.b2PrismaticJoint_GetMotorSpeed(id), b2.b2PrismaticJoint_GetMaxMotorForce(id), b2.b2PrismaticJoint_GetLowerLimit(id), b2.b2PrismaticJoint_GetUpperLimit(id)], [2, 3, -2, 1]],
    ['weld', { angularHertz: 6, linearDampingRatio: 0.5 }, id => [b2.b2WeldJoint_GetAngularHertz(id), b2.b2WeldJoint_GetLinearDampingRatio(id)], [6, 0.5]],
    ['wheel', { motorSpeed: 4, hertz: 2, lowerTranslation: -0.25, upperTranslation: 0.25 }, id => [b2.b2WheelJoint_GetMotorSpeed(id), b2.b2WheelJoint_GetSpringHertz(id), b2.b2WheelJoint_GetLowerLimit(id), b2.b2WheelJoint_GetUpperLimit(id)], [4, 2, -0.25, 0.25]],
  ]
  for (const [type, fields, read, want] of cases) {
    const { truth, joint, w } = jointed(type, JOINTS[type])
    Object.assign(joint.data, fields)
    run(truth, 1)
    expect(read(jointOf(w, joint)), type).toEqual(want)
  }
})

test('strained: a joint loaded past its threshold says so on that step, and the rule may end it', () => {
  const { truth, joint } = jointed('weld', { type: 'weld', forceThreshold: 0.001 })
  let strained = false
  for (let i = 0; i < 30 && !strained; i++) { truth.step(DT); strained = joint.data.strained === true }
  expect(strained).toBe(true)
  truth.end(joint)
  run(truth, 1)
})

test('a joint waits for its bodies, goes with one, and its row then carries no reading', () => {
  const truth = boot(scene([{ is: 'crate', pos: [0, 3] }], { joints: { hinge: JOINTS.revolute } }, { hinge: {} }), simOf(['hinge']))
  const c1 = of(truth, 'crate')[0]
  const hinge = truth.spawn('hinge', ends(c1.id, 999))
  run(truth, 2)
  expect(hinge.data.measured).toBeUndefined()
  const c2 = truth.spawn('crate', { pos: [2, 3] })
  hinge.data.b = c2.id
  run(truth, 2)
  expect(hinge.data.measured).toBeDefined()
  truth.end(c2)
  run(truth, 1)
  expect(hinge.data.measured).toBeUndefined()
})

test('a joint may hold a body to a static body, named -(i + 1)', () => {
  const truth = boot(scene([{ is: 'crate', pos: [0, 3] }], { joints: { hinge: { type: 'revolute' } } }, { hinge: {} }), simOf(['hinge']))
  const hinge = truth.spawn('hinge', ends(-1, of(truth, 'crate')[0].id))
  run(truth, 2)
  expect(hinge.data.measured).toBeDefined()
})

test('truths of a scene with joints land on the same bytes', () => {
  const make = () => jointed('wheel', JOINTS.wheel).truth
  const a = make(), b = make()
  run(a, 120); run(b, 120)
  expect(bytes(a)).toBe(bytes(b))
})

// ---------------------------------------------------------------- explode

test('explode: the act reaches Box2D on the next step: what is inside the radius is blown away, what is outside is not', () => {
  const truth = boot(scene([{ is: 'ball', pos: [1, 0.3] }, { is: 'ball', pos: [9, 0.3] }]), sim)
  run(truth, 30)
  const [near, far] = of(truth, 'ball')
  const farBefore = JSON.stringify(far.data)
  const row = of(truth, 'box2d')[0]
  box2d.acts!.explode(row, wOf(truth), 0, 0, 0, 3, 1, 5)
  expect(row.data.explosions).toEqual([[0, 0, 3, 1, 5]])
  run(truth, 1)
  expect(row.data.explosions).toBeUndefined()
  expect(near.data.vel[0]).toBeGreaterThan(0)
  expect(JSON.stringify(far.data)).toBe(farBefore)
})

// ---------------------------------------------------------------- queries

const crateOnGround = () => boot(scene([{ is: 'crate', pos: [0, 0.5] }]), sim)

test('castRayClosest and castRay: a ray down meets the crate first, then the ground, by the rows\' ids', () => {
  const truth = crateOnGround()
  const w = wOf(truth)
  const id = of(truth, 'crate')[0].id
  expect(castRayClosest(w, [0, 5], [0, -10])!.id).toBe(id)
  expect(castRay(w, [0, 5], [0, -10]).map(h => h.id)).toEqual([id, -1])
  expect(castRayClosest(w, [0, 5], [0, 1])).toBeUndefined()
})

test('castShape, overlapShape and overlapAABB name the bodies that are there', () => {
  const truth = crateOnGround()
  const w = wOf(truth)
  const id = of(truth, 'crate')[0].id
  expect(castShape(w, [0, 5], [0, 0], 0.2, [0, -10]).map(h => h.id)).toEqual([id, -1])
  expect(overlapShape(w, [0, 0.5], [0, 0], 0.2)).toEqual([id])
  expect(overlapAABB(w, [0, 0], [-0.1, 0.4, 0.1, 0.6])).toEqual([id])
})

test('the character mover: castMover, collideMover, solvePlanes and clipVector answer as Box2D does', () => {
  const truth = crateOnGround()
  const w = wOf(truth)
  const mover = { center1: [0, 0] as [number, number], center2: [0, 1] as [number, number], radius: 0.3 }
  expect(castMover(w, [4, 3], mover, [0, -5])).toBeLessThan(1)
  const planes = collideMover(w, [4, 0.25], mover)
  expect(planes.map(p => p.id)).toContain(-1)
  const cp = planes.map(p => ({ plane: { normal: p.normal, offset: p.offset }, pushLimit: 1, push: 0, clipVelocity: true }))
  expect(solvePlanes([0, -1], cp)).toEqual({ ...b2.b2SolvePlanes([0, -1], cp), delta: expect.any(Array) })
  expect(clipVector([1, -1], cp)).toEqual(b2.b2ClipVector([1, -1], cp))
})

test('contacts, massOf, pointVelocity, boundsOf and counters ask Box2D of a body by its row', () => {
  const truth = crateOnGround()
  run(truth, 30)
  const w = wOf(truth)
  const row = of(truth, 'crate')[0], id = bodyOf(w, row)
  const c = contacts(w, row)
  expect(c.map(x => x.with)).toEqual([-1])
  expect(c[0].manifold.points.length).toBeGreaterThan(0)
  expect(massOf(w, row)).toEqual(b2.b2Body_GetMassData(id))
  expect(pointVelocity(w, row, [0.5, 1])).toEqual(b2.b2Body_GetWorldPointVelocity([0, 0], id, [0.5, 1]))
  expect(boundsOf(w, row)).toEqual(b2.b2Body_ComputeAABB([0, 0, 0, 0], id))
  expect(counters(w).bodyCount).toBe(2)
})

test('staticAt: a point inside a static body\'s shape, as the body is placed and turned, and no other', () => {
  const list: Static[] = [
    { pos: [5, 0], rot: [Math.cos(Math.PI / 4), Math.sin(Math.PI / 4)], shapes: [{ box: [1, 0.2] }] },
    { pos: [0, 5], rot: [1, 0], shapes: [{ circle: { center: [0, 0], radius: 1 } }, { segment: { point1: [3, 0], point2: [4, 0] } }] },
  ]
  expect(staticAt({ static: list }, [5.5, 0.5])).toBe(true)
  expect(staticAt({ static: list }, [5.9, 0])).toBe(false)
  expect(staticAt({ static: list }, [0.5, 5.5])).toBe(true)
  expect(staticAt({ static: list }, [3.5, 5])).toBe(false)
})

test('outline: a static body\'s shape as points where it lies', () => {
  const box: Shape = { box: [1, 0.5] }, circle: Shape = { circle: { center: [0, 0], radius: 1 } }, chain: Shape = { chain: { points: [2, 0, 1, 1, 0, 0], isLoop: false, ghost1: [3, 0], ghost2: [-1, 0] } }
  const list: Static[] = [{ pos: [10, 0], rot: [0, 1], shapes: [box, circle, chain] }]
  const round = (g: number[][][]) => g.map(ps => ps.map(p => p.map(c => Math.round(c * 1e5) / 1e5 + 0)))
  expect(round(outline(list, 0, box))).toEqual([[[10.5, -1], [10.5, 1], [9.5, 1], [9.5, -1]]])
  expect(round(outline(list, 0, circle))).toEqual([[[10, 0], [10, -1], [10, 1], [11, 0], [9, 0]]])
  expect(round(outline(list, 0, chain))).toEqual([[[10, 2], [9, 1]], [[9, 1], [10, 0]]])
})

// ---------------------------------------------------------------- the ground

test('ground: a box2d row that lists chunks in a scene with no ground mod throws, saying so', () => {
  const truth = tipped()
  of(truth, 'box2d')[0].data.ground = [[0, 0]]
  expect(() => run(truth, 1)).toThrow(/no ground mod/)
})

// ---------------------------------------------------------------- freeing

test('a world is freed when its row is collected: more truths than Box2D holds worlds, one after another, all step', () => {
  const dir = mkdtempSync(join(tmpdir(), 'box2d-free-'))
  try {
    const file = join(dir, 'free.ts')
    writeFileSync(file, `
import { boot } from ${JSON.stringify(new URL('../../engine/engine.ts', import.meta.url).pathname)}
import { box2d } from ${JSON.stringify(new URL('./box2d.sim.ts', import.meta.url).pathname)}
const scene = () => ({ world: { box2d: { subStepCount: 4, static: [], kinds: { crate: { type: 'dynamic', shapes: [{ box: [0.5, 0.5] }] } } } },
  prefabs: { box2d: {}, crate: { pos: [0, 0], rot: [1, 0], vel: [0, 0], spin: 0, awake: true } }, actors: [{ is: 'box2d' }, { is: 'crate' }] })
for (let i = 0; i < 400; i++) {
  const t = boot(scene(), { box2d, crate: {} })
  t.step(1 / 60)
  if (t.rows.find(r => r.kind === 'crate').data.pos[1] >= 0) throw new Error('truth ' + i + ' did not step')
  if (i % 50 === 49) { globalThis.gc(); await new Promise(r => setTimeout(r, 10)) }
}
console.log('ok')
`)
    expect(execFileSync(process.execPath, ['--expose-gc', '--experimental-strip-types', '--no-warnings', file], { encoding: 'utf8' }).trim()).toBe('ok')
  } finally {
    rmSync(dir, { recursive: true })
  }
})
