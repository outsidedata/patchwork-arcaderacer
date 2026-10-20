// The server half of box2d: rigid bodies, joints, sensors and queries simulated by Box2D v3, Erin
// Catto's physics engine, through box2d.js, a WebAssembly build of it made the way box3d.js is made.
// Its inline flavour carries the binary inside the module, so nothing is fetched, and it is
// instantiated once per process, when this file is first imported. The server and the page run the
// one module, so the same calls land on the same bytes: box2d.js's own test runs Box2D's
// cross-platform determinism scene to Box2D's expected hash. Every name below that Box2D has is
// Box2D's own, so its manual reads straight onto the scene file:
// https://box2d.org/documentation/md_simulation.html.
//
// box2d hands Box2D what the scene and the rows say and writes back what Box2D says. It adds nothing
// to the physics: no wake-up, nudge or clamp of its own. Whatever Box2D does is what the game gets.
//
// What never changes is the scene's `world.box2d`, which a child scene inherits from the manager's
// (`addons/scenemanager`). What changes is on rows: the `box2d` row, which is the world, a row of
// each kind `world.box2d.kinds` lists, which is a body, and a row of each kind `world.box2d.joints`
// lists, which is a joint. A field `world.box2d` or a kind's entry leaves out is Box2D's own default,
// from its `b2Default…Def`, so no number of Box2D's is written here.
//
// A point is [x, y] and a rotation is [c, s], Box2D's b2Rot, the cosine and sine of the angle, so a
// row carries exactly the floats Box2D holds and hands them back unchanged.
//
// `world.box2d`:
//   gravity, restitutionThreshold, restitutionIterations, enableRestitutionPropagation,
//   hitEventThreshold, contactHertz, contactDampingRatio, contactSpeed, maximumLinearSpeed,
//   enableSleep, enableContinuous, capacity
//                      b2WorldDef's fields.
//   enableWarmStarting, contactRecycleDistance
//                      the world's switches b2WorldDef has no field for, set once it is made.
//   subStepCount       the solver's substeps a step; required, as b2World_Step has no default.
//   static             the bodies that never move and that no row carries: each a `pos`, a `rot`
//                      and its `shapes`. A body or a query's answer names static body i as -(i + 1).
//   kinds              kind to Body: the kinds whose rows are bodies. A kind left out is never one.
//   joints             kind to Joint: the kinds whose rows are joints.
//   chunk              the ground's chunks, in whatever numbers the `ground` mod reads (below).
//   mods               `{ ground: '<a>' }`: the plugin whose mod `ground(w, key)` hands back the
//                      ground's chunk at `key` as a Static (`addons/scenemanager`'s mods).
//
// A Body is b2BodyDef's fields that are not where the body is or how it moves — `type` (`dynamic`,
// `kinematic` or `static`), `linearDamping`, `angularDamping`, `gravityScale`, `sleepThreshold`,
// `safetyFactor`, `motionLocks` (`linearX`, `linearY`, `angularZ`), `enableSleep`, `isBullet`,
// `allowFastRotation`, `enableContactRecycling` — with `enableContactEvents` and `enableHitEvents`
// (b2Body_Enable…Events), `name`, `mass` (a b2MassData, `{ mass, center, rotationalInertia }`, which
// replaces the mass its shapes' densities give) and `shapes`.
//
// A Shape is one geometry and b2ShapeDef's fields beside it: `density`, `material` (b2Surface-
// Material: `friction`, `restitution`, `rollingResistance`, `tangentSpeed`, `userMaterialId`,
// `customColor`), `filter` (`categoryBits`, `maskBits`, `groupIndex`; the bits a number, as JSON holds
// no bigint), `isSensor`, `enableSensorEvents`, `enableContactEvents`, `enableHitEvents`,
// `enablePreSolveEvents`, `invokeContactCreation`, `updateBodyMass`, and `oneWay`, below. The
// geometries:
//   circle    { center, radius }.
//   capsule   { center1, center2, radius }.
//   segment   { point1, point2 }.
//   box       [hx, hy], half extents (b2MakeBox).
//   polygon   { points }: the convex hull of the points, a flat [x, y, …] (b2ComputeHull,
//             b2MakePolygon). At most 8 points (B2_MAX_POLYGON_VERTICES); more, or points with no
//             hull, throw saying so.
//   chain     { points, isLoop, materials? }, and for a chain that is not a loop `ghost1` and
//             `ghost2`, the points before its first and after its last that Box2D requires of it: a
//             chain of one-sided segments (b2CreateChain), the points a flat [x, y, …] going
//             counter-clockwise, each segment's solid side on the right of its direction. Or
//             { asset }, a `json` entry of the scene's loader catalogue holding those fields, for a
//             chain as long as a level's ground. With a chain, of the Shape fields only `filter` and
//             `enableSensorEvents` apply, and `material` is every segment's where `materials` gives
//             none (b2ChainDef).
// A box or a polygon may also carry `pos`, `rot` and `radius`: placed and turned on its body and
// rounded so (b2MakeOffsetRoundedBox, b2MakeOffsetRoundedPolygon).
// `oneWay` is a direction in the shape's body frame: a contact on it is kept only while the other
// shape pushes against its face that looks that way, as a platform a body jumps up through and
// lands on (Box2D's pre-solve).
//
// A Joint is `type` — `distance`, `filter`, `motor`, `mover`, `pogo`, `prismatic`, `revolute`, `weld`
// or `wheel` — b2JointDef's fields, `localFrameA` and `localFrameB` each `{ pos, rot }`,
// `forceThreshold`, `torqueThreshold`, `constraintHertz`, `constraintDampingRatio`, `drawScale`,
// `collideConnected`, and the fields of b2<Type>JointDef under their own names.
//
// The rows:
//   box2d    the world. It may carry any of the world's fields a live world can be given — `gravity`,
//            `subStepCount`, `restitutionThreshold`, `restitutionIterations`,
//            `enableRestitutionPropagation`, `hitEventThreshold`, `contactHertz`,
//            `contactDampingRatio`, `contactSpeed`, `maximumLinearSpeed`, `enableSleep`,
//            `enableContinuous`, `enableWarmStarting`, `contactRecycleDistance` — and then the row's
//            value is the world's, pushed each step it differs from the one pushed last.
//            `explode(x, y, radius, falloff, impulsePerLength, maskBits)`, an act, blows the world
//            apart on the next step (b2World_Explode).
//            `ground`, a list of keys, each a list of numbers, is the chunks of the ground the world
//            holds. At the start of each step box2d builds each listed key it lacks by calling the
//            scene's `ground` mod and drops each key it holds that is no longer listed; a key listed
//            step after step is built once. It knows nothing of what the chunks are for: a rule
//            writes the list. A body or a query's answer names every chunk 0.
//   a body   `pos`, `rot`, `vel`, `spin` (the angular velocity, a number) and `awake`, which box2d
//            writes after every step. A rule may write any of them, and a body whose row was written
//            since box2d last wrote it is moved so (b2Body_SetTransform, b2Body_SetLinearVelocity,
//            b2Body_SetAngularVelocity, b2Body_SetAwake): Box2D wakes a body it is given a velocity,
//            and one whose `awake` the rule wrote is set so. It may carry any Body field Box2D can
//            change on a live body — `type`, `enabled`, `linearDamping`, `angularDamping`,
//            `gravityScale`, `sleepThreshold`, `safetyFactor`, `motionLocks`, `enableSleep`,
//            `isBullet`, `enableContactRecycling`, `enableContactEvents`, `enableHitEvents`, `name` —
//            and the row's value is then the body's over its kind's. And what a rule has it do:
//              force, torque   held: a world-frame force at the centre of mass and a torque,
//                              applied every step while the row carries them.
//              pushes          one-shot: a list of `{ impulse, point?, angular? }`, each a linear
//                              impulse at `point` (the centre of mass if left out) and an angular
//                              impulse, applied on the next step; box2d takes the field off then.
//              target          `{ pos, rot }`: a kinematic body is moved there over the next step
//                              (b2Body_SetTargetTransform), and every step after while it stays.
//              wind            `{ wind, drag, lift }`: applied to each of its shapes every step
//                              while the row carries it (b2Shape_ApplyWind).
//            A force, a torque, a push, a target or wind wakes the body, as Box2D's `wake` does,
//            unless the rule wrote `awake` false this step.
//            What box2d reports on it, each only when one of its kind's shapes asks for it, and only
//            while there is something to report, so a row carries none of them otherwise:
//              touching        the bodies it is in contact with, sorted: enableContactEvents.
//              hits            this step's impacts, `{ with, point, normal, speed }`: enableHitEvents.
//              visitors        the bodies inside its sensor shapes, sorted: isSensor with
//                              enableSensorEvents, and the visitor's shape's own enableSensorEvents.
//   a joint  `a` and `b`, the bodies it joins, each a row's id or -(i + 1) for static body i.
//            box2d makes it the first step both are bodies, and it goes with either. It may carry
//            any field of its kind's entry Box2D can change on a live joint — for a wheel, say,
//            `motorSpeed` and `maxMotorTorque` — and the row's value is then the joint's, pushed each
//            step it differs. Each step it stands box2d writes what it does into `measured`, each
//            reading under the name of the Box2D getter it is read with: `constraintForce`,
//            `constraintTorque`, `linearSeparation`, `angularSeparation`, and its type's own —
//            distance `currentLength`, `springForce`, `motorForce`; revolute `angle`, `motorTorque`;
//            prismatic `translation`, `speed`, `motorForce`; wheel `motorTorque`; pogo `length`,
//            `velocity`, `impulse`. `strained` is true on a step its force or torque passed its
//            threshold, and absent otherwise: the joint holds, and the rule decides whether it breaks.
//
// The first step the box2d row ticks it makes its Box2D world and keeps it for as long as the row
// lives: Box2D carries contact impulses, sleep timers and islands from one step to the next, and
// that is the solver's memory, not the game's state. Box2D's own switches for that memory are
// `enableWarmStarting` and `contactRecycleDistance` on `world.box2d`, and `enableContactRecycling`
// on a kind. Every step, before the world steps: a body whose row has ended leaves the world, a
// joint whose row ended or whose body went leaves it, a row with no body or joint gets one, and
// every row's changes are pushed into Box2D. After the step, every body's and joint's row is
// written. So the rows are all the state a seat is sent and a rule reads and writes, and two runs
// of the same presses land on the same bytes. `world.box2d` is read when the world is made, a
// kind's entry when each of its bodies or joints is. The world is freed when its row is collected.
//
// The queries — castRayClosest, castRay, castShape, overlapShape, overlapAABB, castMover,
// collideMover, contacts, massOf, pointVelocity, boundsOf, counters, stateHash — ask the world as the
// last step left it, handed a rule's `w`, and answer in row ids. `bodyOf` and `jointOf` hand back a
// row's Box2D id, for any of Box2D's own b2Body_… and b2Joint_… functions. `solvePlanes` and `clipVector`, the
// character mover's plane solver, need no world. `b2` is the module itself, for Box2D's standalone
// geometry (b2ShapeDistance, b2ShapeCast, b2TimeOfImpact, b2Collide…), which needs no world either.
import Box2D, {
  type b2AABB, type b2BodyId, type b2Capsule, type b2Circle, type b2JointId, type b2MassData, type b2MotionLocks,
  type b2Polygon, type b2Rot, type b2Segment, type b2ShapeId, type b2SurfaceMaterial, type b2Vec2, type b2WorldId,
} from 'box2d.js/inline'
import type { Kind, Row, W } from '#engine/engine.ts'
import type { Wire } from '#engine/browser.ts'
import { json } from '#plugins/loader/loader.sim.ts'
import { mod } from '#addons/scenemanager/scenemanager.addon.ts'
import type { Memory } from '#addons/rewind/rewind.addon.ts'

export const b2 = await Box2D()

// ---------------------------------------------------------------- types

export type Vec2 = b2Vec2
export type Rot = b2Rot
export type Frame = { pos: Vec2; rot: Rot }
export type Filter = { categoryBits: number; maskBits: number; groupIndex: number }
export type Material = Omit<b2SurfaceMaterial, 'userMaterialId'> & { userMaterialId: number }
export type Placed = { pos?: Vec2; rot?: Rot; radius?: number }

export type Chain = { points: number[]; materials?: Partial<Material>[] } & ({ isLoop: true } | { isLoop: false; ghost1: Vec2; ghost2: Vec2 })
export type Geometry = { circle: b2Circle } | { capsule: b2Capsule } | { segment: b2Segment }
  | ({ box: Vec2 } & Placed)
  | ({ polygon: { points: number[] } } & Placed)
  | { chain: Chain | { asset: string } }
export type Shape = Geometry & Partial<{
  density: number
  material: Partial<Material>
  filter: Partial<Filter>
  isSensor: boolean
  enableSensorEvents: boolean
  enableContactEvents: boolean
  enableHitEvents: boolean
  enablePreSolveEvents: boolean
  invokeContactCreation: boolean
  updateBodyMass: boolean
  oneWay: Vec2
}>

export type BodyType = 'dynamic' | 'kinematic' | 'static'
export type Body = { shapes: Shape[] } & Partial<{
  type: BodyType
  linearDamping: number
  angularDamping: number
  gravityScale: number
  sleepThreshold: number
  safetyFactor: number
  motionLocks: Partial<b2MotionLocks>
  enableSleep: boolean
  isBullet: boolean
  allowFastRotation: boolean
  enableContactRecycling: boolean
  enableContactEvents: boolean
  enableHitEvents: boolean
  name: string
  mass: b2MassData
}>
export type Static = { pos: Vec2; rot: Rot; shapes: Shape[] }

type Base = Partial<{
  localFrameA: Frame
  localFrameB: Frame
  forceThreshold: number
  torqueThreshold: number
  constraintHertz: number
  constraintDampingRatio: number
  drawScale: number
  collideConnected: boolean
}>
type Fields<K extends keyof Defs> = Partial<Omit<Defs[K], 'base'>>
type Defs = {
  distance: ReturnType<typeof b2.b2DefaultDistanceJointDef>
  filter: ReturnType<typeof b2.b2DefaultFilterJointDef>
  motor: ReturnType<typeof b2.b2DefaultMotorJointDef>
  mover: ReturnType<typeof b2.b2DefaultMoverJointDef>
  pogo: ReturnType<typeof b2.b2DefaultPogoJointDef>
  prismatic: ReturnType<typeof b2.b2DefaultPrismaticJointDef>
  revolute: ReturnType<typeof b2.b2DefaultRevoluteJointDef>
  weld: ReturnType<typeof b2.b2DefaultWeldJointDef>
  wheel: ReturnType<typeof b2.b2DefaultWheelJointDef>
}
export type JointType = keyof Defs
export type Joint = { [K in JointType]: { type: K } & Base & Fields<K> }[JointType]

export type World = { subStepCount: number; static: Static[]; kinds: Record<string, Body>; joints?: Record<string, Joint> } & Partial<{
  gravity: Vec2
  restitutionThreshold: number
  restitutionIterations: number
  enableRestitutionPropagation: boolean
  hitEventThreshold: number
  contactHertz: number
  contactDampingRatio: number
  contactSpeed: number
  maximumLinearSpeed: number
  enableSleep: boolean
  enableContinuous: boolean
  enableWarmStarting: boolean
  contactRecycleDistance: number
  capacity: Partial<ReturnType<typeof b2.b2DefaultWorldDef>['capacity']>
  chunk: unknown
  mods: Record<string, string>
}>

export type Motion = { pos: Vec2; rot: Rot; vel: Vec2; spin: number; awake: boolean }
export type Push = { impulse?: Vec2; point?: Vec2; angular?: number }
export type Hit = { with: number; point: Vec2; normal: Vec2; speed: number }
export type QueryFilter = Partial<{ categoryBits: number; maskBits: number }>
export type RayHit = { id: number; point: Vec2; normal: Vec2; fraction: number }
export type Plane = { normal: Vec2; offset: number; point: Vec2 }
export type CollisionPlane = { plane: { normal: Vec2; offset: number }; pushLimit: number; push: number; clipVelocity: boolean }

// ---------------------------------------------------------------- shapes

const TYPE = { dynamic: b2.b2BodyType.b2_dynamicBody, kinematic: b2.b2BodyType.b2_kinematicBody, static: b2.b2BodyType.b2_staticBody }

const key = (id: { index1: number; generation: number }) => `${id.index1}:${id.generation}`
const v2 = (a: Vec2): Vec2 => [a[0], a[1]]
const r2 = (a: Rot): Rot => [a[0], a[1]]
const copy = (d: Motion): Motion => ({ pos: v2(d.pos), rot: r2(d.rot), vel: v2(d.vel), spin: d.spin, awake: d.awake })
const same = (a: number[], b: number[]) => a[0] === b[0] && a[1] === b[1]
const equal = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)
const big = (n: number) => BigInt(n)
const IDENTITY: Frame = { pos: [0, 0], rot: [1, 0] }
const transform = (f: Frame) => ({ p: v2(f.pos), q: r2(f.rot) })

function queryFilter(f: QueryFilter = {}) {
  const q = b2.b2DefaultQueryFilter()
  if (f.categoryBits !== undefined) q.categoryBits = big(f.categoryBits)
  if (f.maskBits !== undefined) q.maskBits = big(f.maskBits)
  return q
}

function filterOf(f: Partial<Filter>, base: ReturnType<typeof b2.b2DefaultShapeDef>['filter']) {
  return {
    categoryBits: f.categoryBits === undefined ? base.categoryBits : big(f.categoryBits),
    maskBits: f.maskBits === undefined ? base.maskBits : big(f.maskBits),
    groupIndex: f.groupIndex ?? base.groupIndex,
  }
}

function materialOf(m: Partial<Material>, base: b2SurfaceMaterial): b2SurfaceMaterial {
  const { userMaterialId, ...rest } = m
  return { ...base, ...rest, ...(userMaterialId === undefined ? {} : { userMaterialId: big(userMaterialId) }) }
}

function shapeDef(s: Shape) {
  const def = b2.b2DefaultShapeDef()
  if (s.density !== undefined) def.density = s.density
  if (s.material) def.material = materialOf(s.material, def.material)
  if (s.filter) def.filter = filterOf(s.filter, def.filter)
  for (const k of ['isSensor', 'enableSensorEvents', 'enableContactEvents', 'enableHitEvents', 'enablePreSolveEvents', 'invokeContactCreation', 'updateBodyMass'] as const) {
    if (s[k] !== undefined) def[k] = s[k]!
  }
  if (s.oneWay) def.enablePreSolveEvents = true
  return def
}

// The polygon of a box or a polygon geometry, placed, turned and rounded as it says.
function polygonOf(g: ({ box: Vec2 } | { polygon: { points: number[] } }) & Placed): b2Polygon {
  const pos = g.pos ?? [0, 0], rot = g.rot ?? [1, 0], radius = g.radius ?? 0
  if ('box' in g) return b2.b2MakeOffsetRoundedBox(g.box[0], g.box[1], pos, rot, radius)
  const hull = b2.b2ComputeHull(g.polygon.points)
  if (hull.count === 0) throw new Error(`Box2D could not make a hull of ${JSON.stringify(g.polygon.points)}: at most ${b2.B2_MAX_POLYGON_VERTICES} points, not all on a line`)
  return b2.b2MakeOffsetRoundedPolygon(hull, pos, rot, radius)
}

// A chain's fields, from the loader for one that names an asset.
function chainOf(c: Chain | { asset: string }, w: W | Wire | undefined): Chain {
  if (!('asset' in c)) return c
  if (!w) throw new Error(`chain asset ${c.asset} is read through the loader: hand outline a rule's w or a page's wire`)
  return json(w, c.asset)
}

// A shape on a body: the ids of the shapes it made, one, or a chain's segments.
function makeShape(body: b2BodyId, s: Shape, w: W | Wire | undefined): b2ShapeId[] {
  if ('chain' in s) {
    const chain = chainOf(s.chain, w)
    const def = b2.b2DefaultChainDef()
    def.points = chain.points
    def.isLoop = chain.isLoop
    if (!chain.isLoop) {
      def.ghost1 = chain.ghost1
      def.ghost2 = chain.ghost2
    }
    if (s.filter) def.filter = filterOf(s.filter, def.filter)
    if (s.enableSensorEvents !== undefined) def.enableSensorEvents = s.enableSensorEvents
    const all = materialOf(s.material ?? {}, b2.b2DefaultSurfaceMaterial())
    def.materials = chain.materials ? chain.materials.map(m => materialOf(m, all)) : [all]
    const segments = b2.b2Chain_GetSegments(b2.b2CreateChain(body, def))
    const ids: b2ShapeId[] = []
    for (let i = 0; i < segments.size(); i++) ids.push(segments.get(i)!)
    segments.delete()
    return ids
  }
  const def = shapeDef(s)
  if ('circle' in s) return [b2.b2CreateCircleShape(body, def, s.circle)]
  if ('capsule' in s) return [b2.b2CreateCapsuleShape(body, def, s.capsule)]
  if ('segment' in s) return [b2.b2CreateSegmentShape(body, def, s.segment)]
  return [b2.b2CreatePolygonShape(body, def, polygonOf(s))]
}

// ---------------------------------------------------------------- staticAt, outline

// The static bodies alone, as a world of their own, each shape keyed by itself, for the questions
// asked of the place that never moves. Kept per `static` list; a list edited is a new list, and a
// new world.
const alone = new WeakMap<Static[], { world: b2WorldId; shapes: Map<Shape, b2ShapeId[]> }>()
const unalone = new FinalizationRegistry<b2WorldId>(world => b2.b2DestroyWorld(world))
function aloneOf(list: Static[], from: W | Wire | undefined) {
  let s = alone.get(list)
  if (s) return s
  const world = b2.b2CreateWorld(b2.b2DefaultWorldDef())
  const shapes = new Map<Shape, b2ShapeId[]>()
  for (const b of list) {
    const bd = b2.b2DefaultBodyDef()
    bd.position = v2(b.pos)
    bd.rotation = r2(b.rot)
    const id = b2.b2CreateBody(world, bd)
    for (const sh of b.shapes) shapes.set(sh, makeShape(id, sh, from))
  }
  s = { world, shapes }
  alone.set(list, s)
  unalone.register(list, world)
  return s
}

// Whether the point [x, y] is inside one of the world's `static` bodies, as Box2D's b2Shape_TestPoint
// answers for each of their shapes where it lies in the world. A segment and a chain have no inside.
// It is what a rule or a check asks of the place that never moves: whether a thing put somewhere is
// in a wall. A chain read from an asset is read through `from`, a rule's `w` or a page's wire.
export function staticAt(world: Pick<World, 'static'>, point: number[], from?: W | Wire): boolean {
  const s = aloneOf(world.static, from)
  for (const ids of s.shapes.values()) for (const id of ids) if (b2.b2Shape_TestPoint(id, [point[0], point[1]])) return true
  return false
}

// Static body i's shape as it lies in the world, as groups of points: a circle as its centre and
// the four points a radius off it along the axes, a capsule as its two circles so, a box or a
// polygon as its vertices, a segment as its two points, and a chain as each of its segments. It is
// what a flat view of the place draws.
export function outline(list: Static[], i: number, shape: Shape, from?: W | Wire): Vec2[][] {
  const ids = aloneOf(list, from).shapes.get(list[i].shapes.find(sh => sh === shape)!)!
  return ids.map(id => {
    const body = b2.b2Shape_GetBody(id)
    const at = (p: Vec2): Vec2 => b2.b2Body_GetWorldPoint([0, 0], body, p)
    const ball = (c: Vec2, r: number): Vec2[] => [c, [c[0] - r, c[1]], [c[0] + r, c[1]], [c[0], c[1] - r], [c[0], c[1] + r]]
    const type = b2.b2Shape_GetType(id).value
    if (type === b2.b2ShapeType.b2_circleShape.value) {
      const c = b2.b2Shape_GetCircle(id)
      return ball(c.center, c.radius).map(at)
    }
    if (type === b2.b2ShapeType.b2_capsuleShape.value) {
      const c = b2.b2Shape_GetCapsule(id)
      return [...ball(c.center1, c.radius), ...ball(c.center2, c.radius)].map(at)
    }
    if (type === b2.b2ShapeType.b2_segmentShape.value) {
      const g = b2.b2Shape_GetSegment(id)
      return [g.point1, g.point2].map(at)
    }
    if (type === b2.b2ShapeType.b2_chainSegmentShape.value) {
      const g = b2.b2Shape_GetChainSegment(id).segment
      return [g.point1, g.point2].map(at)
    }
    const p = b2.b2Shape_GetPolygon(id)
    const out: Vec2[] = []
    for (let k = 0; k < p.count; k++) out.push(at([p.vertices[2 * k], p.vertices[2 * k + 1]]))
    return out
  })
}

// ---------------------------------------------------------------- the world

// A body, and what box2d last wrote to or pushed from its row: a field that differs from it, a rule
// wrote.
type Held = Motion & { id: b2BodyId; kind: string; live: Record<string, unknown>; sensors: boolean; contacts: boolean; hits: boolean; touching: Map<number, number>; visitors: Map<number, number> }
type Tied = { id: b2JointId; type: JointType; a: number; b: number; live: Record<string, unknown> }
// Box2D's world, and what box2d holds beside it.
type Made = {
  world: b2WorldId
  statics: b2BodyId[]
  bodies: Map<number, Held>
  joints: Map<number, Tied>
  owner: Map<string, number> // a body's or a shape's key to the row, or -(i + 1) for static body i
  oneWay: Map<string, Vec2>
  chunks: Map<string, b2BodyId> // the ground's chunks the world holds, by key
  live: Record<string, unknown>
  events: ReturnType<typeof b2.createEventsBuffer>
}

// Keyed by the box2d row, so each truth has its own world.
const made = new WeakMap<Row, Made>()
const unmade = new FinalizationRegistry<{ world: b2WorldId; events: ReturnType<typeof b2.createEventsBuffer> }>(m => {
  b2.b2DestroyWorld(m.world)
  b2.destroyEventsBuffer(m.events)
})

// The world's fields a live world can be given, each with what gives it.
const WORLD_LIVE: [string[], (world: b2WorldId, ...v: any[]) => void][] = [
  [['gravity'], (w, g) => b2.b2World_SetGravity(w, g)],
  [['restitutionThreshold'], (w, v) => b2.b2World_SetRestitutionThreshold(w, v)],
  [['restitutionIterations'], (w, v) => b2.b2World_SetRestitutionIterations(w, v)],
  [['enableRestitutionPropagation'], (w, v) => b2.b2World_EnableRestitutionPropagation(w, v)],
  [['hitEventThreshold'], (w, v) => b2.b2World_SetHitEventThreshold(w, v)],
  [['contactHertz', 'contactDampingRatio', 'contactSpeed'], (w, h, d, s) => b2.b2World_SetContactTuning(w, h, d, s)],
  [['maximumLinearSpeed'], (w, v) => b2.b2World_SetMaximumLinearSpeed(w, v)],
  [['enableSleep'], (w, v) => b2.b2World_EnableSleeping(w, v)],
  [['enableContinuous'], (w, v) => b2.b2World_EnableContinuous(w, v)],
  [['enableWarmStarting'], (w, v) => b2.b2World_EnableWarmStarting(w, v)],
  [['contactRecycleDistance'], (w, v) => b2.b2World_SetContactRecycleDistance(w, v)],
]
const WORLD_DEF = ['gravity', 'restitutionThreshold', 'restitutionIterations', 'enableRestitutionPropagation', 'hitEventThreshold', 'contactHertz', 'contactDampingRatio', 'contactSpeed', 'maximumLinearSpeed', 'enableSleep', 'enableContinuous'] as const

function make(me: Row, w: W): Made {
  const d: World = w.world.box2d
  const def = b2.b2DefaultWorldDef()
  for (const k of WORLD_DEF) if (d[k] !== undefined) (def as any)[k] = d[k]
  if (d.capacity) def.capacity = { ...def.capacity, ...d.capacity }
  const world = b2.b2CreateWorld(def)
  if (d.enableWarmStarting !== undefined) b2.b2World_EnableWarmStarting(world, d.enableWarmStarting)
  if (d.contactRecycleDistance !== undefined) b2.b2World_SetContactRecycleDistance(world, d.contactRecycleDistance)
  const m: Made = {
    world, statics: [], bodies: new Map(), joints: new Map(), owner: new Map(), oneWay: new Map(), chunks: new Map(),
    live: {}, events: b2.createEventsBuffer(),
  }
  d.static.forEach((s, i) => m.statics.push(place(m, s, -(i + 1), w)))
  b2.b2World_SetPreSolveCallback(world, oneWay(m), null)
  made.set(me, m)
  unmade.register(me, { world, events: m.events }, m)
  return m
}

// What a truth's snapshot does not carry of box2d (`Memory` in the scenemanager addon): the whole
// Box2D world as Box2D's own snapshot image (bodies, shapes, contacts with their warm starting
// impulses, islands, sleep, the broad phase), and box2d's tables beside it, which row each body,
// shape and joint is and what box2d last pushed from each row. The image is the bytes Box2D wrote, a
// `Uint8Array`, kept as they are from step to step and carried as they are across the socket; the
// tables are plain JSON.
type Memo = {
  image: Uint8Array
  statics: b2BodyId[]
  bodies: [number, Omit<Held, 'touching' | 'visitors'> & { touching: [number, number][]; visitors: [number, number][] }][]
  joints: [number, Tied][]
  owner: [string, number][]
  oneWay: [string, Vec2][]
  chunks: [string, b2BodyId][]
  live: Record<string, unknown>
}
// A memo handed to a box2d row of a truth loaded from a snapshot, for its next step to restore.
const taken = new WeakMap<Row, Memo>()

// The world of the row a truth held before it loaded a snapshot, moved to the row of the same id
// that the load put in its place, so the restore puts the image into the world there is rather than
// a new one: a server that rewinds every few steps, or a page that takes the server's truth back,
// would otherwise make a world each time, and Box2D holds a fixed number of worlds.
function move(was: Row, me: Row) {
  const m = made.get(was)
  if (!m) return
  made.delete(was)
  made.set(me, m)
  unmade.unregister(m)
  unmade.register(me, { world: m.world, events: m.events }, m)
}

// The image is Box2D's own copy, made for this call (b2World_GetSnapshot hands back a fresh array),
// so only the tables are cloned off the live ones.
function hold(me: Row): Memo | undefined {
  const m = made.get(me)
  if (!m) return undefined
  const image = b2.b2World_GetSnapshot(m.world)
  if (!image.length) throw new Error('box2d: the world is mid step and cannot be saved')
  return { image, ...structuredClone({
    statics: m.statics,
    bodies: [...m.bodies].map(([id, h]) => [id, { ...h, touching: [...h.touching], visitors: [...h.visitors] }]),
    joints: [...m.joints],
    owner: [...m.owner],
    oneWay: [...m.oneWay],
    chunks: [...m.chunks],
    live: m.live,
  }) as Omit<Memo, 'image'> }
}

// The row's world, or one made for it, put back to the memo's image (Box2D keeps the world's
// callbacks through a restore), and box2d's tables taken from the memo, every id re-pointed at this
// world, since a body's id names the world it is in.
function restore(me: Row, w: W): Made {
  const memo = taken.get(me)!
  taken.delete(me)
  const m = made.get(me) ?? make(me, w)
  if (!b2.b2World_Restore(m.world, memo.image)) throw new Error('box2d: the snapshot image would not restore')
  const here = <T extends { world0: number }>(id: T): T => ({ ...id, world0: m.world.index1 - 1 })
  m.statics = memo.statics.map(here)
  m.bodies = new Map(memo.bodies.map(([id, h]) => [id, { ...h, id: here(h.id), touching: new Map(h.touching), visitors: new Map(h.visitors) }]))
  m.joints = new Map(memo.joints.map(([id, j]) => [id, { ...j, id: here(j.id) }]))
  m.owner = new Map(memo.owner)
  m.oneWay = new Map(memo.oneWay)
  m.chunks = new Map(memo.chunks.map(([key, id]) => [key, here(id)]))
  m.live = memo.live
  return m
}

// A contact on a one-way shape is kept while the other shape is on the face that looks along
// `oneWay`: the manifold's normal, which points from shape A to shape B, pointing out of that face.
// A contact dropped is a manifold of no points, as Box2D's pre-solve takes it. Box2D holds the
// callback for as long as the world lives, so it is made here, where it can reach nothing but the
// tables: made inside `make` it would hold the row and the truth, and the world would never be freed.
function oneWay(m: Made) {
  return (a: b2ShapeId, b: b2ShapeId, manifold: { normal: Vec2; pointCount: number }) => {
    const wayA = m.oneWay.get(key(a)), wayB = m.oneWay.get(key(b))
    if ((wayA && dot(worldVector(b2.b2Shape_GetBody(a), wayA), manifold.normal) <= 0)
      || (wayB && dot(worldVector(b2.b2Shape_GetBody(b), wayB), manifold.normal) >= 0)) manifold.pointCount = 0
  }
}

// A static body in the world, named `as`.
function place(m: Made, s: Static, as: number, w: W): b2BodyId {
  const bd = b2.b2DefaultBodyDef()
  bd.position = v2(s.pos)
  bd.rotation = r2(s.rot)
  const id = b2.b2CreateBody(m.world, bd)
  m.owner.set(key(id), as)
  for (const sh of s.shapes) for (const sid of makeShape(id, sh, w)) {
    m.owner.set('s' + key(sid), as)
    if (sh.oneWay) m.oneWay.set(key(sid), sh.oneWay)
  }
  return id
}

// The ground's chunks to what the box2d row lists: each listed key it lacks built by the scene's
// `ground` mod, each it holds that is not listed dropped.
function chunks(m: Made, listed: number[][], w: W) {
  const want = new Map(listed.map(k => [k.join(','), k]))
  for (const [k, id] of m.chunks) {
    if (want.has(k)) continue
    unplace(m, id)
    m.chunks.delete(k)
  }
  if (![...want.keys()].some(k => !m.chunks.has(k))) return
  const ground = mod<(w: W, key: number[]) => Static>(w.world, 'box2d', 'ground')
  if (!ground) throw new Error('the box2d row lists ground chunks, and the scene gives box2d no ground mod (world.box2d.mods.ground)')
  for (const [k, at] of want) if (!m.chunks.has(k)) m.chunks.set(k, place(m, ground(w, at), 0, w))
}

// A body out of the world, and out of every table naming it or its shapes.
function unplace(m: Made, id: b2BodyId) {
  const shapes = b2.b2Body_GetShapes(id)
  for (let i = 0; i < shapes.size(); i++) {
    const s = shapes.get(i)!
    m.owner.delete('s' + key(s))
    m.oneWay.delete(key(s))
  }
  shapes.delete()
  m.owner.delete(key(id))
  b2.b2DestroyBody(id)
}

const dot = (a: number[], b: number[]) => a[0] * b[0] + a[1] * b[1]
const worldVector = (body: b2BodyId, v: Vec2) => b2.b2Body_GetWorldVector([0, 0], body, v)

// ---------------------------------------------------------------- bodies

// A body's fields Box2D can change on a live body, each with what changes it. The row's value, or
// else its kind's, is what the body is given.
const BODY_LIVE: Record<string, (id: b2BodyId, v: any) => void> = {
  type: (id, v: BodyType) => b2.b2Body_SetType(id, TYPE[v]),
  enabled: (id, v: boolean) => v ? b2.b2Body_Enable(id) : b2.b2Body_Disable(id),
  linearDamping: (id, v) => b2.b2Body_SetLinearDamping(id, v),
  angularDamping: (id, v) => b2.b2Body_SetAngularDamping(id, v),
  gravityScale: (id, v) => b2.b2Body_SetGravityScale(id, v),
  sleepThreshold: (id, v) => b2.b2Body_SetSleepThreshold(id, v),
  safetyFactor: (id, v) => b2.b2Body_SetSafetyFactor(id, v),
  motionLocks: (id, v: Partial<b2MotionLocks>) => b2.b2Body_SetMotionLocks(id, { ...b2.b2Body_GetMotionLocks(id), ...v }),
  enableSleep: (id, v) => b2.b2Body_EnableSleep(id, v),
  isBullet: (id, v) => b2.b2Body_SetBullet(id, v),
  enableContactRecycling: (id, v) => b2.b2Body_EnableContactRecycling(id, v),
  enableContactEvents: (id, v) => b2.b2Body_EnableContactEvents(id, v),
  enableHitEvents: (id, v) => b2.b2Body_EnableHitEvents(id, v),
  name: (id, v) => b2.b2Body_SetName(id, v),
}
const BODY_DEF = ['linearDamping', 'angularDamping', 'gravityScale', 'sleepThreshold', 'safetyFactor', 'enableSleep', 'isBullet', 'allowFastRotation', 'enableContactRecycling'] as const

function body(m: Made, row: Row, k: Body, w: W): Held {
  const d = row.data as Motion & Record<string, any>
  const bd = b2.b2DefaultBodyDef()
  const type: BodyType | undefined = d.type ?? k.type
  if (type) bd.type = TYPE[type]
  bd.position = v2(d.pos)
  bd.rotation = r2(d.rot)
  bd.linearVelocity = v2(d.vel)
  bd.angularVelocity = d.spin
  bd.isAwake = d.awake
  for (const f of BODY_DEF) {
    const v = d[f] ?? k[f]
    if (v !== undefined) (bd as any)[f] = v
  }
  const locks = d.motionLocks ?? k.motionLocks
  if (locks) bd.motionLocks = { ...bd.motionLocks, ...locks }
  if (d.enabled !== undefined) bd.isEnabled = d.enabled
  const id = b2.b2CreateBody(m.world, bd)
  const name = d.name ?? k.name
  if (name !== undefined) b2.b2Body_SetName(id, name)
  for (const f of ['enableContactEvents', 'enableHitEvents'] as const) {
    const v = d[f] ?? k[f]
    if (v !== undefined) BODY_LIVE[f](id, v)
  }
  m.owner.set(key(id), row.id)
  for (const s of k.shapes) for (const sid of makeShape(id, s, w)) {
    m.owner.set('s' + key(sid), row.id)
    if (s.oneWay) m.oneWay.set(key(sid), s.oneWay)
  }
  if (k.mass) b2.b2Body_SetMassData(id, k.mass)
  const live: Record<string, unknown> = {}
  for (const f of Object.keys(BODY_LIVE)) if (f in d) live[f] = structuredClone(d[f])
  return {
    id, kind: row.kind, live, ...copy(d),
    sensors: k.shapes.some(s => s.isSensor && s.enableSensorEvents),
    contacts: k.shapes.some(s => s.enableContactEvents),
    hits: k.shapes.some(s => s.enableHitEvents),
    touching: new Map(), visitors: new Map(),
  }
}

function push(h: Held, d: Motion & Record<string, any>, dt: number) {
  for (const f of Object.keys(BODY_LIVE)) {
    if (!(f in d) || equal(d[f], h.live[f])) continue
    BODY_LIVE[f](h.id, d[f])
    h.live[f] = structuredClone(d[f])
  }
  if (!same(h.pos, d.pos) || !same(h.rot, d.rot)) b2.b2Body_SetTransform(h.id, d.pos, d.rot)
  if (!same(h.vel, d.vel)) b2.b2Body_SetLinearVelocity(h.id, d.vel)
  if (h.spin !== d.spin) b2.b2Body_SetAngularVelocity(h.id, d.spin)
  if (d.awake !== h.awake) b2.b2Body_SetAwake(h.id, d.awake)
  // What a rule has the body do wakes it, as Box2D's `wake` does, unless it wrote awake false.
  const wake = d.awake || d.awake === h.awake
  if (d.force) b2.b2Body_ApplyForceToCenter(h.id, d.force, wake)
  if (d.torque) b2.b2Body_ApplyTorque(h.id, d.torque, wake)
  if (d.pushes) {
    for (const p of d.pushes as Push[]) {
      if (p.impulse) {
        if (p.point) b2.b2Body_ApplyLinearImpulse(h.id, p.impulse, p.point, wake)
        else b2.b2Body_ApplyLinearImpulseToCenter(h.id, p.impulse, wake)
      }
      if (p.angular) b2.b2Body_ApplyAngularImpulse(h.id, p.angular, wake)
    }
    delete d.pushes
  }
  if (d.target) b2.b2Body_SetTargetTransform(h.id, transform(d.target), dt, wake)
  if (d.wind) {
    const shapes = b2.b2Body_GetShapes(h.id)
    for (let i = 0; i < shapes.size(); i++) b2.b2Shape_ApplyWind(shapes.get(i)!, d.wind.wind, d.wind.drag, d.wind.lift, wake)
    shapes.delete()
  }
}

function pull(h: Held, d: Motion & Record<string, any>) {
  d.pos = b2.b2Body_GetPosition([0, 0], h.id)
  d.rot = b2.b2Body_GetRotation([1, 0], h.id)
  d.vel = b2.b2Body_GetLinearVelocity([0, 0], h.id)
  d.spin = b2.b2Body_GetAngularVelocity(h.id)
  d.awake = b2.b2Body_IsAwake(h.id)
  Object.assign(h, copy(d))
  const list = (counts: Map<number, number>) => [...counts.keys()].sort((a, b) => a - b)
  if (h.contacts) { if (h.touching.size) d.touching = list(h.touching); else delete d.touching }
  if (h.sensors) { if (h.visitors.size) d.visitors = list(h.visitors); else delete d.visitors }
}

// ---------------------------------------------------------------- joints

type Setter = [string[], (id: b2JointId, ...v: any[]) => void]
const BASE_LIVE: Setter[] = [
  [['collideConnected'], (id, v) => b2.b2Joint_SetCollideConnected(id, v)],
  [['constraintHertz', 'constraintDampingRatio'], (id, h, d) => b2.b2Joint_SetConstraintTuning(id, h, d)],
  [['forceThreshold'], (id, v) => b2.b2Joint_SetForceThreshold(id, v)],
  [['torqueThreshold'], (id, v) => b2.b2Joint_SetTorqueThreshold(id, v)],
  [['localFrameA'], (id, f: Frame) => b2.b2Joint_SetLocalFrameA(id, transform(f))],
  [['localFrameB'], (id, f: Frame) => b2.b2Joint_SetLocalFrameB(id, transform(f))],
]
const JOINT_LIVE: Record<JointType, Setter[]> = {
  distance: [
    [['length'], (id, v) => b2.b2DistanceJoint_SetLength(id, v)],
    [['enableSpring'], (id, v) => b2.b2DistanceJoint_EnableSpring(id, v)],
    [['lowerSpringForce', 'upperSpringForce'], (id, lo, hi) => b2.b2DistanceJoint_SetSpringForceRange(id, lo, hi)],
    [['hertz'], (id, v) => b2.b2DistanceJoint_SetSpringHertz(id, v)],
    [['dampingRatio'], (id, v) => b2.b2DistanceJoint_SetSpringDampingRatio(id, v)],
    [['enableLimit'], (id, v) => b2.b2DistanceJoint_EnableLimit(id, v)],
    [['minLength', 'maxLength'], (id, lo, hi) => b2.b2DistanceJoint_SetLengthRange(id, lo, hi)],
    [['enableMotor'], (id, v) => b2.b2DistanceJoint_EnableMotor(id, v)],
    [['maxMotorForce'], (id, v) => b2.b2DistanceJoint_SetMaxMotorForce(id, v)],
    [['motorSpeed'], (id, v) => b2.b2DistanceJoint_SetMotorSpeed(id, v)],
  ],
  filter: [],
  motor: [
    [['linearVelocity'], (id, v) => b2.b2MotorJoint_SetLinearVelocity(id, v)],
    [['maxVelocityForce'], (id, v) => b2.b2MotorJoint_SetMaxVelocityForce(id, v)],
    [['angularVelocity'], (id, v) => b2.b2MotorJoint_SetAngularVelocity(id, v)],
    [['maxVelocityTorque'], (id, v) => b2.b2MotorJoint_SetMaxVelocityTorque(id, v)],
    [['linearHertz'], (id, v) => b2.b2MotorJoint_SetLinearHertz(id, v)],
    [['linearDampingRatio'], (id, v) => b2.b2MotorJoint_SetLinearDampingRatio(id, v)],
    [['maxSpringForce'], (id, v) => b2.b2MotorJoint_SetMaxSpringForce(id, v)],
    [['angularHertz'], (id, v) => b2.b2MotorJoint_SetAngularHertz(id, v)],
    [['angularDampingRatio'], (id, v) => b2.b2MotorJoint_SetAngularDampingRatio(id, v)],
    [['maxSpringTorque'], (id, v) => b2.b2MotorJoint_SetMaxSpringTorque(id, v)],
  ],
  mover: [
    [['linearVelocity'], (id, v) => b2.b2MoverJoint_SetLinearVelocity(id, v)],
    [['maxVelocityForce'], (id, v) => b2.b2MoverJoint_SetMaxVelocityForce(id, v)],
  ],
  pogo: [
    [['restLength'], (id, v) => b2.b2PogoJoint_SetRestLength(id, v)],
    [['hertz'], (id, v) => b2.b2PogoJoint_SetSpringHertz(id, v)],
    [['dampingRatio'], (id, v) => b2.b2PogoJoint_SetSpringDampingRatio(id, v)],
  ],
  prismatic: [
    [['enableSpring'], (id, v) => b2.b2PrismaticJoint_EnableSpring(id, v)],
    [['hertz'], (id, v) => b2.b2PrismaticJoint_SetSpringHertz(id, v)],
    [['dampingRatio'], (id, v) => b2.b2PrismaticJoint_SetSpringDampingRatio(id, v)],
    [['targetTranslation'], (id, v) => b2.b2PrismaticJoint_SetTargetTranslation(id, v)],
    [['enableLimit'], (id, v) => b2.b2PrismaticJoint_EnableLimit(id, v)],
    [['lowerTranslation', 'upperTranslation'], (id, lo, hi) => b2.b2PrismaticJoint_SetLimits(id, lo, hi)],
    [['enableMotor'], (id, v) => b2.b2PrismaticJoint_EnableMotor(id, v)],
    [['maxMotorForce'], (id, v) => b2.b2PrismaticJoint_SetMaxMotorForce(id, v)],
    [['motorSpeed'], (id, v) => b2.b2PrismaticJoint_SetMotorSpeed(id, v)],
  ],
  revolute: [
    [['targetAngle'], (id, v) => b2.b2RevoluteJoint_SetTargetAngle(id, v)],
    [['enableSpring'], (id, v) => b2.b2RevoluteJoint_EnableSpring(id, v)],
    [['hertz'], (id, v) => b2.b2RevoluteJoint_SetSpringHertz(id, v)],
    [['dampingRatio'], (id, v) => b2.b2RevoluteJoint_SetSpringDampingRatio(id, v)],
    [['enableLimit'], (id, v) => b2.b2RevoluteJoint_EnableLimit(id, v)],
    [['lowerAngle', 'upperAngle'], (id, lo, hi) => b2.b2RevoluteJoint_SetLimits(id, lo, hi)],
    [['enableMotor'], (id, v) => b2.b2RevoluteJoint_EnableMotor(id, v)],
    [['maxMotorTorque'], (id, v) => b2.b2RevoluteJoint_SetMaxMotorTorque(id, v)],
    [['motorSpeed'], (id, v) => b2.b2RevoluteJoint_SetMotorSpeed(id, v)],
  ],
  weld: [
    [['linearHertz'], (id, v) => b2.b2WeldJoint_SetLinearHertz(id, v)],
    [['angularHertz'], (id, v) => b2.b2WeldJoint_SetAngularHertz(id, v)],
    [['linearDampingRatio'], (id, v) => b2.b2WeldJoint_SetLinearDampingRatio(id, v)],
    [['angularDampingRatio'], (id, v) => b2.b2WeldJoint_SetAngularDampingRatio(id, v)],
  ],
  wheel: [
    [['enableSpring'], (id, v) => b2.b2WheelJoint_EnableSpring(id, v)],
    [['hertz'], (id, v) => b2.b2WheelJoint_SetSpringHertz(id, v)],
    [['dampingRatio'], (id, v) => b2.b2WheelJoint_SetSpringDampingRatio(id, v)],
    [['enableLimit'], (id, v) => b2.b2WheelJoint_EnableLimit(id, v)],
    [['lowerTranslation', 'upperTranslation'], (id, lo, hi) => b2.b2WheelJoint_SetLimits(id, lo, hi)],
    [['enableMotor'], (id, v) => b2.b2WheelJoint_EnableMotor(id, v)],
    [['maxMotorTorque'], (id, v) => b2.b2WheelJoint_SetMaxMotorTorque(id, v)],
    [['motorSpeed'], (id, v) => b2.b2WheelJoint_SetMotorSpeed(id, v)],
  ],
}
// What each type of joint reports on its row every step.
const JOINT_READ: Record<JointType, (id: b2JointId) => Record<string, unknown>> = {
  distance: id => ({ currentLength: b2.b2DistanceJoint_GetCurrentLength(id), springForce: b2.b2DistanceJoint_GetSpringForce(id), motorForce: b2.b2DistanceJoint_GetMotorForce(id) }),
  filter: () => ({}),
  motor: () => ({}),
  mover: () => ({}),
  pogo: id => ({ length: b2.b2PogoJoint_GetLength(id), velocity: b2.b2PogoJoint_GetVelocity(id), impulse: b2.b2PogoJoint_GetImpulse(id) }),
  prismatic: id => ({ translation: b2.b2PrismaticJoint_GetTranslation(id), speed: b2.b2PrismaticJoint_GetSpeed(id), motorForce: b2.b2PrismaticJoint_GetMotorForce(id) }),
  revolute: id => ({ angle: b2.b2RevoluteJoint_GetAngle(id), motorTorque: b2.b2RevoluteJoint_GetMotorTorque(id) }),
  weld: () => ({}),
  wheel: id => ({ motorTorque: b2.b2WheelJoint_GetMotorTorque(id) }),
}
// The fields a row writes for itself or box2d writes back: never a setting of the joint's.
const JOINT_OWN = new Set(['a', 'b', 'measured', 'strained'])

const CREATE: Record<JointType, (world: b2WorldId, def: any) => b2JointId> = {
  distance: (w, d) => b2.b2CreateDistanceJoint(w, d),
  filter: (w, d) => b2.b2CreateFilterJoint(w, d),
  motor: (w, d) => b2.b2CreateMotorJoint(w, d),
  mover: (w, d) => b2.b2CreateMoverJoint(w, d),
  pogo: (w, d) => b2.b2CreatePogoJoint(w, d),
  prismatic: (w, d) => b2.b2CreatePrismaticJoint(w, d),
  revolute: (w, d) => b2.b2CreateRevoluteJoint(w, d),
  weld: (w, d) => b2.b2CreateWeldJoint(w, d),
  wheel: (w, d) => b2.b2CreateWheelJoint(w, d),
}
const DEFAULT: Record<JointType, () => any> = {
  distance: () => b2.b2DefaultDistanceJointDef(),
  filter: () => b2.b2DefaultFilterJointDef(),
  motor: () => b2.b2DefaultMotorJointDef(),
  mover: () => b2.b2DefaultMoverJointDef(),
  pogo: () => b2.b2DefaultPogoJointDef(),
  prismatic: () => b2.b2DefaultPrismaticJointDef(),
  revolute: () => b2.b2DefaultRevoluteJointDef(),
  weld: () => b2.b2DefaultWeldJointDef(),
  wheel: () => b2.b2DefaultWheelJointDef(),
}
const BASE_FIELDS = ['forceThreshold', 'torqueThreshold', 'constraintHertz', 'constraintDampingRatio', 'drawScale', 'collideConnected'] as const

// The body a joint's end names: a row's, or static body i's for -(i + 1).
const end = (m: Made, at: number) => at < 0 ? m.statics[-at - 1] : m.bodies.get(at)?.id

function tie(m: Made, row: Row, j: Joint): Tied | undefined {
  const d = row.data
  const A = end(m, d.a), B = end(m, d.b)
  if (!A || !B) return undefined
  const def = DEFAULT[j.type]()
  const over = { ...j, ...Object.fromEntries(Object.entries(d).filter(([f]) => !JOINT_OWN.has(f))) } as Record<string, any>
  def.base.bodyIdA = A
  def.base.bodyIdB = B
  def.base.localFrameA = transform(over.localFrameA ?? IDENTITY)
  def.base.localFrameB = transform(over.localFrameB ?? IDENTITY)
  for (const f of BASE_FIELDS) if (over[f] !== undefined) def.base[f] = over[f]
  for (const f of Object.keys(def)) if (f !== 'base' && over[f] !== undefined) def[f] = over[f]
  const id = CREATE[j.type](m.world, def)
  const live: Record<string, unknown> = {}
  for (const [fields] of [...BASE_LIVE, ...JOINT_LIVE[j.type]]) for (const f of fields) if (f in d) live[f] = structuredClone(d[f])
  return { id, type: j.type, a: d.a, b: d.b, live }
}

function pushJoint(t: Tied, j: Joint, d: Record<string, any>) {
  for (const [fields, set] of [...BASE_LIVE, ...JOINT_LIVE[t.type]]) {
    if (!fields.some(f => f in d && !equal(d[f], t.live[f]))) continue
    // A pair set together, as a limit's two ends, takes the other end from the row, else the kind,
    // else Box2D's default.
    const fallback = DEFAULT[t.type]()
    set(t.id, ...fields.map(f => d[f] ?? (j as any)[f] ?? fallback[f] ?? fallback.base[f]))
    for (const f of fields) if (f in d) t.live[f] = structuredClone(d[f])
    b2.b2Joint_WakeBodies(t.id)
  }
}

function pullJoint(t: Tied, d: Record<string, any>) {
  d.measured = {
    constraintForce: b2.b2Joint_GetConstraintForce([0, 0], t.id),
    constraintTorque: b2.b2Joint_GetConstraintTorque(t.id),
    linearSeparation: b2.b2Joint_GetLinearSeparation(t.id),
    angularSeparation: b2.b2Joint_GetAngularSeparation(t.id),
    ...JOINT_READ[t.type](t.id),
  }
}

// ---------------------------------------------------------------- events

const touch = b2.createContactTouchEvent()
const hit = b2.createContactHitEvent()
const sense = b2.createSensorTouchEvent()
const strain = b2.createJointEvent()

const bump = (counts: Map<number, number>, id: number, by: number) => {
  const n = (counts.get(id) ?? 0) + by
  if (n > 0) counts.set(id, n)
  else counts.delete(id)
}

// This step's events, onto what the bodies and joints hold and their rows. A shape of a body whose
// row ended this step is no longer in the world, so its events name no one and are dropped.
function events(m: Made, rows: Map<number, Row>, joints: Map<number, Row>) {
  const eb = b2.getEvents(m.events, m.world)
  const who = (s: b2ShapeId) => m.owner.get('s' + key(s))
  const pair = (by: number, get: (o: typeof touch, eb: any, i: number) => void, n: number) => {
    for (let i = 0; i < n; i++) {
      get(touch, eb, i)
      const a = who(touch.shapeIdA), b = who(touch.shapeIdB)
      if (a === undefined || b === undefined) continue
      const ha = m.bodies.get(a), hb = m.bodies.get(b)
      if (ha?.contacts) bump(ha.touching, b, by)
      if (hb?.contacts) bump(hb.touching, a, by)
    }
  }
  pair(1, (o, e, i) => b2.getContactBeginEventAt(o, e, i), b2.getNumContactBeginEvents(eb))
  pair(-1, (o, e, i) => b2.getContactEndEventAt(o, e, i), b2.getNumContactEndEvents(eb))
  const struck = new Map<number, Hit[]>()
  for (let i = 0, n = b2.getNumContactHitEvents(eb); i < n; i++) {
    b2.getContactHitEventAt(hit, eb, i)
    const a = who(hit.shapeIdA), b = who(hit.shapeIdB)
    if (a === undefined || b === undefined) continue
    // The normal points from A to B; each is told of it as it points into itself.
    const blow = (me: number, other: number, normal: Vec2) => {
      if (!m.bodies.get(me)?.hits) return
      struck.set(me, [...(struck.get(me) ?? []), { with: other, point: v2(hit.point), normal, speed: hit.approachSpeed }])
    }
    blow(a, b, [-hit.normal[0], -hit.normal[1]])
    blow(b, a, v2(hit.normal))
  }
  for (const [id, h] of m.bodies) {
    const d = rows.get(id)!.data
    if (!h.hits) continue
    if (struck.has(id)) d.hits = struck.get(id)
    else delete d.hits
  }
  const sensed = (by: number, get: (o: typeof sense, eb: any, i: number) => void, n: number) => {
    for (let i = 0; i < n; i++) {
      get(sense, eb, i)
      const s = who(sense.sensorShapeId), v = who(sense.visitorShapeId)
      if (s === undefined || v === undefined) continue
      const hs = m.bodies.get(s)
      if (hs?.sensors) bump(hs.visitors, v, by)
    }
  }
  sensed(1, (o, e, i) => b2.getSensorBeginEventAt(o, e, i), b2.getNumSensorBeginEvents(eb))
  sensed(-1, (o, e, i) => b2.getSensorEndEventAt(o, e, i), b2.getNumSensorEndEvents(eb))
  const strained = new Set<string>()
  for (let i = 0, n = b2.getNumJointEvents(eb); i < n; i++) {
    b2.getJointEventAt(strain, eb, i)
    strained.add(key(strain.jointId))
  }
  for (const [id, t] of m.joints) {
    const d = joints.get(id)!.data
    if (strained.has(key(t.id))) d.strained = true
    else delete d.strained
  }
}

// ---------------------------------------------------------------- the step

export const box2d: Kind & Memory = {
  // The world and box2d's tables handed out as they stand, the world untouched: for a page that runs
  // the scene ahead, and for every step a server that rewinds keeps (`addons/rewind`).
  hold(me) { return hold(me) },
  // On a truth loaded from a snapshot, the page's copy or a server rewinding: restored from on its
  // next step, into the world the row it replaced had, when it had one.
  take(me, memo, was) {
    if (was) move(was, me)
    taken.set(me, memo as Memo)
  },
  tick(me, dt, w) {
    const d: World = w.world.box2d
    const m = taken.has(me) ? restore(me, w) : made.get(me) ?? make(me, w)
    for (const [fields, set] of WORLD_LIVE) {
      if (!fields.some(f => f in me.data && !equal(me.data[f], m.live[f]))) continue
      set(m.world, ...fields.map(f => me.data[f] ?? (d as any)[f] ?? (b2.b2DefaultWorldDef() as any)[f]))
      for (const f of fields) if (f in me.data) m.live[f] = structuredClone(me.data[f])
    }
    const bodies = new Map(Object.keys(d.kinds).flatMap(k => w.all(k)).map(r => [r.id, r]))
    const joints = new Map(Object.keys(d.joints ?? {}).flatMap(k => w.all(k)).map(r => [r.id, r]))
    // A joint goes before its bodies: Box2D takes a body's joints with it, and a joint of a body
    // gone is remade, if its row asks, once both its ends are bodies again.
    for (const [id, t] of m.joints) {
      const r = joints.get(id)
      if (r && r.data.a === t.a && r.data.b === t.b && (t.a < 0 || bodies.has(t.a)) && (t.b < 0 || bodies.has(t.b))) continue
      if (b2.b2Joint_IsValid(t.id)) b2.b2DestroyJoint(t.id)
      m.joints.delete(id)
    }
    chunks(m, me.data.ground ?? [], w)
    for (const [id, h] of m.bodies) {
      if (bodies.has(id)) continue
      unplace(m, h.id)
      m.bodies.delete(id)
      for (const o of m.bodies.values()) { o.touching.delete(id); o.visitors.delete(id) }
    }
    for (const row of bodies.values()) {
      const h = m.bodies.get(row.id)
      if (h) push(h, row.data, dt)
      else {
        const made = body(m, row, d.kinds[row.kind], w)
        m.bodies.set(row.id, made)
        push(made, row.data, dt)
      }
    }
    for (const row of joints.values()) {
      const j = d.joints![row.kind]
      const t = m.joints.get(row.id)
      if (t) pushJoint(t, j, row.data)
      else {
        const tied = tie(m, row, j)
        if (tied) m.joints.set(row.id, tied)
      }
    }
    for (const e of (me.data.explosions ?? []) as number[][]) {
      const [x, y, radius, falloff, impulsePerLength, maskBits] = e
      const def = b2.b2DefaultExplosionDef()
      def.position = [x, y]
      def.radius = radius
      def.falloff = falloff
      def.impulsePerLength = impulsePerLength
      if (maskBits !== undefined) def.maskBits = big(maskBits)
      b2.b2World_Explode(m.world, def)
    }
    delete me.data.explosions
    b2.b2World_Step(m.world, dt, me.data.subStepCount ?? d.subStepCount)
    events(m, bodies, joints)
    for (const row of bodies.values()) pull(m.bodies.get(row.id)!, row.data)
    for (const [id, row] of joints) {
      const t = m.joints.get(id)
      if (t) pullJoint(t, row.data)
      else { delete row.data.measured; delete row.data.strained }
    }
  },
  acts: {
    // Blows the world apart on the next step: an impulse per length of each shape's outline within
    // `radius` of the point, less by `falloff` towards the edge, on the shapes whose category
    // `maskBits` names (every shape if left out).
    explode(me, _w, _seat, x: number, y: number, radius: number, falloff: number, impulsePerLength: number, maskBits?: number) {
      me.data.explosions = [...(me.data.explosions ?? []), maskBits === undefined ? [x, y, radius, falloff, impulsePerLength] : [x, y, radius, falloff, impulsePerLength, maskBits]]
    },
  },
}

// ---------------------------------------------------------------- queries

// The world of the scene's box2d row, as its last step left it.
function worldOf(w: W): Made {
  const m = made.get(w.find('box2d'))
  if (!m) throw new Error('box2d has not stepped yet, so there is no world to ask')
  return m
}
const ownerOf = (m: Made, s: b2ShapeId) => m.owner.get('s' + key(s))!
const heldOf = (m: Made, row: Row) => {
  const h = m.bodies.get(row.id)
  if (!h) throw new Error(`row ${row.id} (${row.kind}) is not a body of box2d's world`)
  return h
}

// A body row's Box2D body and a joint row's Box2D joint.
export const bodyOf = (w: W, row: Row): b2BodyId => heldOf(worldOf(w), row).id
export function jointOf(w: W, row: Row): b2JointId {
  const t = worldOf(w).joints.get(row.id)
  if (!t) throw new Error(`row ${row.id} (${row.kind}) is not a joint of box2d's world`)
  return t.id
}

// The first thing a ray from `origin` along `translation` meets, or undefined.
export function castRayClosest(w: W, origin: Vec2, translation: Vec2, filter?: QueryFilter): RayHit | undefined {
  const m = worldOf(w)
  const r = b2.b2World_CastRayClosest(m.world, origin, translation, queryFilter(filter))
  return r.hit ? { id: ownerOf(m, r.shapeId), point: v2(r.point), normal: v2(r.normal), fraction: r.fraction } : undefined
}

// Everything a ray meets, nearest first; one hit per shape.
export function castRay(w: W, origin: Vec2, translation: Vec2, filter?: QueryFilter): RayHit[] {
  const m = worldOf(w)
  const hits: RayHit[] = []
  b2.b2World_CastRay(m.world, origin, translation, queryFilter(filter), (s, point, normal, fraction) => {
    hits.push({ id: ownerOf(m, s), point: v2(point), normal: v2(normal), fraction })
    return 1
  })
  return hits.sort((a, b) => a.fraction - b.fraction || a.id - b.id)
}

// Everything a convex shape — the hull of `points` about `origin`, rounded by `radius` — meets as
// it is swept along `translation`, nearest first.
export function castShape(w: W, origin: Vec2, points: number[], radius: number, translation: Vec2, filter?: QueryFilter): RayHit[] {
  const m = worldOf(w)
  const hits: RayHit[] = []
  b2.b2World_CastShape(m.world, origin, b2.b2MakeProxy(points, radius), translation, queryFilter(filter), (s, point, normal, fraction) => {
    hits.push({ id: ownerOf(m, s), point: v2(point), normal: v2(normal), fraction })
    return 1
  })
  return hits.sort((a, b) => a.fraction - b.fraction || a.id - b.id)
}

const unique = (ids: number[]) => [...new Set(ids)].sort((a, b) => a - b)

// The bodies a convex shape at `origin` overlaps.
export function overlapShape(w: W, origin: Vec2, points: number[], radius: number, filter?: QueryFilter): number[] {
  const m = worldOf(w)
  const ids: number[] = []
  b2.b2World_OverlapShape(m.world, origin, b2.b2MakeProxy(points, radius), queryFilter(filter), s => { ids.push(ownerOf(m, s)); return true })
  return unique(ids)
}

// The bodies whose shapes' bounds overlap the box [minX, minY, maxX, maxY] about `origin`.
export function overlapAABB(w: W, origin: Vec2, aabb: b2AABB, filter?: QueryFilter): number[] {
  const m = worldOf(w)
  const ids: number[] = []
  b2.b2World_OverlapAABB(m.world, origin, aabb, queryFilter(filter), s => { ids.push(ownerOf(m, s)); return true })
  return unique(ids)
}

// The character mover: how far along `translation`, 0 to 1, a capsule at `origin` moves before it
// meets something.
export function castMover(w: W, origin: Vec2, mover: b2Capsule, translation: Vec2, filter?: QueryFilter): number {
  return b2.b2World_CastMover(worldOf(w).world, origin, mover, translation, queryFilter(filter))
}

// The character mover: the planes of everything a capsule at `origin` touches or is inside, each
// with the body it is of.
export function collideMover(w: W, origin: Vec2, mover: b2Capsule, filter?: QueryFilter): (Plane & { id: number })[] {
  const m = worldOf(w)
  const planes: (Plane & { id: number })[] = []
  const out = b2.createPlaneResult()
  b2.b2World_CollideMover(m.world, origin, mover, queryFilter(filter), (s, buf) => {
    for (let i = 0, n = b2.getNumPlaneResults(buf); i < n; i++) {
      b2.getPlaneResultAt(out, buf, i)
      planes.push({ id: ownerOf(m, s), normal: v2(out.plane.normal), offset: out.plane.offset, point: v2(out.point) })
    }
    return true
  })
  return planes
}

// The character mover's solver: the move nearest `targetDelta` that the planes allow.
export function solvePlanes(targetDelta: Vec2, planes: CollisionPlane[]): { delta: Vec2; iterationCount: number } {
  const r = b2.b2SolvePlanes(targetDelta, planes)
  return { delta: v2(r.delta), iterationCount: r.iterationCount }
}

// A velocity with the part of it into the planes taken off.
export function clipVector(vector: Vec2, planes: CollisionPlane[]): Vec2 {
  return v2(b2.b2ClipVector(vector, planes))
}

// Every contact a body is in: the other body, and its manifold's normal and points.
export function contacts(w: W, row: Row) {
  const m = worldOf(w)
  const h = heldOf(m, row)
  const buf = b2.createContactsBuffer()
  const c = b2.createContact()
  try {
    b2.getBodyContactData(buf, h.id)
    const out = []
    for (let i = 0, n = b2.getNumContacts(buf); i < n; i++) {
      b2.getContactAt(c, buf, i)
      const a = ownerOf(m, c.shapeIdA), b = ownerOf(m, c.shapeIdB)
      const mf = c.manifold
      out.push({
        a, b, with: a === row.id ? b : a,
        manifold: {
          normal: v2(mf.normal), rollingImpulse: mf.rollingImpulse,
          points: mf.points.slice(0, mf.pointCount).map(p => ({ ...p, anchorA: v2(p.anchorA), anchorB: v2(p.anchorB) })),
        },
      })
    }
    return out
  } finally {
    b2.destroyContactsBuffer(buf)
  }
}

// A body's mass, centre of mass (its own frame) and rotational inertia.
export function massOf(w: W, row: Row): b2MassData {
  return b2.b2Body_GetMassData(heldOf(worldOf(w), row).id)
}

// The velocity of a point of the world as it rides on a body.
export function pointVelocity(w: W, row: Row, point: Vec2): Vec2 {
  return b2.b2Body_GetWorldPointVelocity([0, 0], heldOf(worldOf(w), row).id, point)
}

// The bounds of a body's shapes, [minX, minY, maxX, maxY].
export function boundsOf(w: W, row: Row): b2AABB {
  return b2.b2Body_ComputeAABB([0, 0, 0, 0], heldOf(worldOf(w), row).id)
}

// How much the world holds and how many of its bodies are awake.
export function counters(w: W) {
  const m = worldOf(w)
  return { ...b2.b2World_GetCounters(m.world), awakeBodyCount: b2.b2World_GetAwakeBodyCount(m.world) }
}

// Box2D's hash of the whole simulation state, its memory between steps too (b2World_GetStateHash):
// two worlds with the same hash will step alike.
export function stateHash(w: W): bigint {
  return b2.b2World_GetStateHash(worldOf(w).world)
}
