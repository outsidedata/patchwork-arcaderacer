// The server half of box3d: rigid bodies, joints, sensors and queries simulated by Box3D, Erin
// Catto's physics engine, through the box3d.js WebAssembly build. Its inline flavour carries the
// binary inside the module, so nothing is fetched, and it is instantiated once per process, when
// this file is first imported. Every name below that Box3D has is Box3D's own, so its manual reads
// straight onto the scene file: https://box2d.org/documentation3d/md_simulation.html.
//
// What never changes is the scene's `world.box3d`, which a child scene inherits from the manager's
// (`addons/scenemanager`). What changes is on rows: the `box3d` row, which is the world, a row of
// each kind `world.box3d.kinds` lists, which is a body, and a row of each kind `world.box3d.joints`
// lists, which is a joint, and a row of each kind a `kinds` mod makes (`mods`, below). A field
// `world.box3d` or a kind's entry leaves out is Box3D's own default, from its `b3Default…Def`, so no
// number of Box3D's is written here.
//
// `world.box3d`:
//   gravity, restitutionThreshold, hitEventThreshold, contactHertz, contactDampingRatio,
//   contactSpeed, maximumLinearSpeed, enableSleep, enableContinuous, capacity
//                      b3WorldDef's fields.
//   enableWarmStarting, enableSpeculative, contactRecycleDistance
//                      the world's switches b3WorldDef has no field for, set once it is made.
//   subStepCount       the solver's substeps a step; required, as b3World_Step has no default.
//   static             the bodies that never move and that no row carries: each a `pos`, a `rot`
//                      and its `shapes`. A body or a query's answer names static body i as -(i + 1).
//   kinds              kind to Body: the kinds whose rows are bodies. A kind left out, and made by
//                      no `kinds` mod, is never one.
//   joints             kind to Joint: the kinds whose rows are joints.
//   chunk              `{ count, cell }`: the ground's chunks, each `count` heights a side `cell`
//                      metres apart, for the `ground` mod (below).
//   mods               `{ ground: '<a>', props: ['<a>', …], kinds: ['<a>', …] }`, the plugins whose mods give
//                      box3d those functions (`addons/scenemanager`'s mods): `ground(w, [i, j])` hands
//                      back chunk [i, j] of the ground as a Static; `props(w, [i, j])`, from every
//                      plugin `props` names, the fixed things of that plugin's standing in chunk
//                      [i, j] (each one's middle in the chunk's square), as a Static, or undefined
//                      where there are none, streamed with the ground; `kinds(w)`, from every plugin
//                      `kinds` names, hands back the kinds that plugin makes out of numbers of its own, `{ bodies: { <kind>: row => Body },
//                      joints: { <kind>: row => Joint } }`, each asked for a row's entry when box3d
//                      makes its body or joint, so two rows of one kind may differ, as two wheels of
//                      one car of different sizes do. A kind `kinds` or `joints` lists is its entry.
//
// A Body is b3BodyDef's fields that are not where the body is or how it moves — `type` (`dynamic`,
// `kinematic` or `static`), `linearDamping`, `angularDamping`, `gravityScale`, `sleepThreshold`,
// `motionLocks`, `enableSleep`, `isBullet`, `allowFastRotation`, `enableContactRecycling` — with
// `enableHitEvents` (b3Body_EnableHitEvents), `name`, `mass` (a b3MassData, `{ mass, center,
// inertia: { cx, cy, cz } }`, which replaces the mass its shapes' densities give) and `shapes`.
//
// A Shape is one geometry and b3ShapeDef's fields beside it: `density`, `baseMaterial` (b3Surface-
// Material: `friction`, `restitution`, `rollingResistance`, `tangentVelocity`, `userMaterialId`,
// `customColor`), `explosionScale`, `filter` (`categoryBits`, `maskBits`, `groupIndex`; the bits a
// number, as JSON holds no bigint), `isSensor`, `enableSensorEvents`, `enableContactEvents`,
// `enableHitEvents`, `invokeContactCreation`, `updateBodyMass`, and `oneWay`, below. The geometries:
//   box       [hx, hy, hz], half extents.
//   sphere    { center, radius }.
//   capsule   { center1, center2, radius }.
//   hull      { points }: the convex hull of the points, a flat [x, y, z, …].
//   cylinder  { height, radius, yOffset, sides }, b3CreateCylinder's hull.
//   cone      { height, radius1, radius2, slices }, b3CreateCone's hull.
//   rock      { radius }, b3CreateRock's hull.
//   mesh      triangles: { positions, indices } inline, { asset } a `json` entry of the scene's
//             loader catalogue holding those two, or { make, … } one of Box3D's makers — `box`
//             { center, extent, identifyEdges }, `hollowBox` { center, extent }, `grid` { xCount,
//             zCount, cellWidth, materialCount, identifyEdges }, `wave` { xCount, zCount,
//             cellWidth, amplitude, rowFrequency, columnFrequency }, `torus` { radialResolution,
//             tubularResolution, radius, thickness }, `platform` { center, height, topWidth,
//             bottomWidth } — each with a `scale`, [1, 1, 1] if left out.
//   heightField  { heights, countX, countZ, scale } inline, { asset, scale } a `json` entry holding
//             `heights`, `countX` and `countZ`, or { make: 'grid', rowCount, columnCount, scale,
//             makeHoles } or { make: 'wave', rowCount, columnCount, scale, rowFrequency,
//             columnFrequency, makeHoles }.
//   compound  { hulls: [{ points, pos, rot }] }: convex children on one body, which Box3D allows
//             only on a static body.
// A hull holds at most 128 vertices and 255 half edges (Box3D's limits): a cylinder or a cone of
// more than about 40 sides is refused, and the shape throws saying so. A cylinder's and a cone's
// base is at y = yOffset (0) and its top at the height.
// A box, a hull, a cylinder, a cone or a rock may also carry `pos`, `rot` and `scale`: the hull is
// placed, turned and stretched on its body so (b3CreateTransformedHullShape).
// `oneWay` is a direction in the shape's body frame: a contact on it is kept only while the other
// shape pushes against its face that looks that way, as a platform a body jumps up through and
// lands on (Box3D's pre-solve).
//
// A Joint is `type` — `distance`, `revolute`, `prismatic`, `wheel`, `weld`, `spherical`, `motor`,
// `parallel` or `filter` — b3JointDef's fields, `localFrameA` and `localFrameB` each `{ pos, rot }`,
// `forceThreshold`, `torqueThreshold`, `constraintHertz`, `constraintDampingRatio`, `drawScale`,
// `collideConnected`, and the fields of b3<Type>JointDef under their own names.
//
// The rows:
//   box3d    the world. It may carry any of the world's fields a live world can be given — `gravity`,
//            `subStepCount`, `restitutionThreshold`, `hitEventThreshold`, `contactHertz`,
//            `contactDampingRatio`, `contactSpeed`, `maximumLinearSpeed`, `enableSleep`,
//            `enableContinuous`, `enableWarmStarting`, `enableSpeculative`,
//            `contactRecycleDistance` — and then the row's value is the world's, pushed each step it
//            differs from the one pushed last. `explode(x, y, z, radius, falloff, impulsePerArea,
//            maskBits)`, an act, blows the world apart on the next step (b3World_Explode).
//            `ground`, a list of keys `[i, j]`, is the chunks of the ground the world holds. At the
//            start of each step box3d builds each listed key it lacks by calling the scene's `ground`
//            mod, and each `props` mod the scene names, and drops each key it holds that is no longer
//            listed, ground and props together; a key listed step after step is built once. It knows
//            nothing of what the chunks are for: a rule writes the list. A body or a query's answer
//            names every chunk 0, its props too.
//   a body   `pos`, `rot` (a quaternion, x y z w), `vel`, `spin` (the angular velocity) and `awake`,
//            which box3d writes after every step. A rule may write any of them, and a body whose
//            row was written since box3d last wrote it is moved so and woken, unless the rule wrote
//            `awake` itself. It may carry any Body field Box3D can change on a live body — `type`,
//            `enabled`, `linearDamping`, `angularDamping`, `gravityScale`, `sleepThreshold`,
//            `motionLocks`, `enableSleep`, `isBullet`, `enableContactRecycling`, `enableHitEvents`,
//            `name` — and the row's value is then the body's over its kind's. `friction` sets every
//            one of its shapes' friction over their `baseMaterial`'s (b3Shape_SetFriction); Box3D
//            mixes a contact's friction each step, so it holds from the next. And what a rule has
//            it do:
//              force, torque   held: a world-frame force at the centre of mass and a torque,
//                              applied every step while the row carries them.
//              pushes          one-shot: a list of `{ impulse, point?, angular? }`, each a linear
//                              impulse at `point` (the centre of mass if left out) and an angular
//                              impulse, applied on the next step; box3d takes the field off then.
//              target          `{ pos, rot }`: a kinematic body is moved there over the next step
//                              (b3Body_SetTargetTransform), and every step after while it stays.
//              wind            `{ wind, drag, lift, maxSpeed }`: applied to each of its shapes every
//                              step while the row carries it (b3Shape_ApplyWind).
//            What box3d reports on it, each only when one of its kind's shapes asks for it, and only
//            while there is something to report, so a row carries none of them otherwise:
//              touching        the bodies it is in contact with, sorted: enableContactEvents.
//              hits            this step's impacts, `{ with, point, normal, speed }`: enableHitEvents.
//              visitors        the bodies inside its sensor shapes, sorted: isSensor with
//                              enableSensorEvents, and the visitor's shape's own enableSensorEvents.
//   a joint  `a` and `b`, the bodies it joins, each a row's id or -(i + 1) for static body i.
//            box3d makes it the first step both are bodies, and it goes with either. It may carry
//            any field of its kind's entry Box3D can change on a live joint — for a wheel, say,
//            `spinSpeed`, `maxSpinTorque` and `targetSteeringAngle` — and the row's value is then
//            the joint's, pushed each step it differs. Each step it stands box3d writes what it does
//            into `measured`, each reading under the name of the Box3D getter it is read with, as
//            several share a name with a setting (a wheel's `spinSpeed` is the motor's target in
//            its def and the wheel's own spin from b3WheelJoint_GetSpinSpeed): `constraintForce`,
//            `constraintTorque`, `linearSeparation`, `angularSeparation`, and its type's own —
//            distance `currentLength`, `motorForce`; revolute `angle`, `motorTorque`; prismatic
//            `translation`, `speed`, `motorForce`; wheel `spinSpeed`, `spinTorque`,
//            `steeringAngle`, `steeringTorque`; spherical `twistAngle`, `coneAngle`,
//            `motorTorque`. `strained` is true on a step its force or torque passed its threshold,
//            and absent otherwise: the joint holds, and the rule decides whether it breaks.
//
// The first step the box3d row ticks it makes its Box3D world and keeps it for as long as the row
// lives: Box3D carries contact impulses, sleep timers and islands from one step to the next, and
// that is the solver's memory, not the game's state. Every step, before the world steps: a body
// whose row has ended leaves the world and wakes what it touched, a joint whose row ended or whose
// body went leaves it, a row with no body or joint gets one, and every row's changes are pushed
// into Box3D. After the step, every body's and joint's row is written. So the rows are all the state
// a seat is sent and a rule reads and writes, and two runs of the same presses land on the same
// bytes. `world.box3d` is read when the world is made, a kind's entry when each of its bodies or
// joints is. The world, and the triangle and height data its shapes point at, are freed when its
// row is collected.
//
// The queries — castRayClosest, castRay, castShape, overlapShape, overlapAABB, castMover,
// collideMover, contacts, massOf, pointVelocity, boundsOf, counters — ask the world as the last
// step left it, handed a rule's `w`, and answer in row ids. `solvePlanes` and `clipVector`, the
// character mover's plane solver, need no world. `b3` is the module itself, for Box3D's standalone
// geometry (b3ShapeDistance, b3ShapeCast, b3TimeOfImpact, b3Collide…), which needs no world either.
import Box3D, {
  type b3AABB, type b3BodyId, type b3Capsule, type b3JointId, type b3MassData, type b3MotionLocks, type b3Quat,
  type b3ShapeId, type b3Sphere, type b3SurfaceMaterial, type b3Vec3, type b3WorldId,
} from 'box3d.js/inline'
import type { Kind, Row, W } from '#engine/engine.ts'
import type { Wire } from '#engine/browser.ts'
import { json } from '#plugins/loader/loader.sim.ts'
import * as math from '#plugins/math/math.sim.ts'
import { mod, modsOf } from '#addons/scenemanager/scenemanager.addon.ts'
import type { Memory } from '#addons/rewind/rewind.addon.ts'

export const b3 = await Box3D()

// ---------------------------------------------------------------- types

export type Vec3 = b3Vec3
export type Quat = b3Quat
export type Frame = { pos: Vec3; rot: Quat }
export type Filter = { categoryBits: number; maskBits: number; groupIndex: number }
export type Material = Omit<b3SurfaceMaterial, 'userMaterialId'> & { userMaterialId: number }
export type Placed = { pos?: Vec3; rot?: Quat; scale?: Vec3 }

export type Mesh = ({ positions: number[]; indices: number[] } | { asset: string }
  | { make: 'box'; center: Vec3; extent: Vec3; identifyEdges: boolean }
  | { make: 'hollowBox'; center: Vec3; extent: Vec3 }
  | { make: 'grid'; xCount: number; zCount: number; cellWidth: number; materialCount: number; identifyEdges: boolean }
  | { make: 'wave'; xCount: number; zCount: number; cellWidth: number; amplitude: number; rowFrequency: number; columnFrequency: number }
  | { make: 'torus'; radialResolution: number; tubularResolution: number; radius: number; thickness: number }
  | { make: 'platform'; center: Vec3; height: number; topWidth: number; bottomWidth: number }) & { scale?: Vec3 }
export type HeightField = { heights: number[]; countX: number; countZ: number; scale: Vec3 } | { asset: string; scale: Vec3 }
  | { make: 'grid'; rowCount: number; columnCount: number; scale: Vec3; makeHoles: boolean }
  | { make: 'wave'; rowCount: number; columnCount: number; scale: Vec3; rowFrequency: number; columnFrequency: number; makeHoles: boolean }

export type Geometry = ({ box: Vec3 } & Placed) | { sphere: b3Sphere } | { capsule: b3Capsule }
  | ({ hull: { points: number[] } } & Placed)
  | ({ cylinder: { height: number; radius: number; yOffset: number; sides: number } } & Placed)
  | ({ cone: { height: number; radius1: number; radius2: number; slices: number } } & Placed)
  | ({ rock: { radius: number } } & Placed)
  | { mesh: Mesh } | { heightField: HeightField }
  | { compound: { hulls: { points: number[]; pos: Vec3; rot: Quat }[] } }
export type Shape = Geometry & Partial<{
  density: number
  baseMaterial: Partial<Material>
  explosionScale: number
  filter: Partial<Filter>
  isSensor: boolean
  enableSensorEvents: boolean
  enableContactEvents: boolean
  enableHitEvents: boolean
  invokeContactCreation: boolean
  updateBodyMass: boolean
  oneWay: Vec3
}>

export type BodyType = 'dynamic' | 'kinematic' | 'static'
export type Body = { shapes: Shape[] } & Partial<{
  type: BodyType
  linearDamping: number
  angularDamping: number
  gravityScale: number
  sleepThreshold: number
  motionLocks: Partial<b3MotionLocks>
  enableSleep: boolean
  isBullet: boolean
  allowFastRotation: boolean
  enableContactRecycling: boolean
  enableHitEvents: boolean
  name: string
  mass: b3MassData
}>
export type Static = { pos: Vec3; rot: Quat; shapes: Shape[] }

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
  distance: ReturnType<typeof b3.b3DefaultDistanceJointDef>
  revolute: ReturnType<typeof b3.b3DefaultRevoluteJointDef>
  prismatic: ReturnType<typeof b3.b3DefaultPrismaticJointDef>
  wheel: ReturnType<typeof b3.b3DefaultWheelJointDef>
  weld: ReturnType<typeof b3.b3DefaultWeldJointDef>
  spherical: ReturnType<typeof b3.b3DefaultSphericalJointDef>
  motor: ReturnType<typeof b3.b3DefaultMotorJointDef>
  parallel: ReturnType<typeof b3.b3DefaultParallelJointDef>
  filter: ReturnType<typeof b3.b3DefaultFilterJointDef>
}
export type JointType = keyof Defs
export type Joint = { [K in JointType]: { type: K } & Base & Fields<K> }[JointType]

export type World = { subStepCount: number; static: Static[]; kinds: Record<string, Body>; joints?: Record<string, Joint> } & Partial<{
  gravity: Vec3
  restitutionThreshold: number
  hitEventThreshold: number
  contactHertz: number
  contactDampingRatio: number
  contactSpeed: number
  maximumLinearSpeed: number
  enableSleep: boolean
  enableContinuous: boolean
  enableWarmStarting: boolean
  enableSpeculative: boolean
  contactRecycleDistance: number
  capacity: Partial<{ staticShapeCount: number; dynamicShapeCount: number; staticBodyCount: number; dynamicBodyCount: number; contactCount: number }>
  chunk: { count: number; cell: number }
  mods: Record<string, string>
}>

// What a `kinds` mod hands back: the kinds a plugin makes, each with the entry of one of its rows.
export type Kinds = { bodies?: Record<string, (row: Row) => Body>; joints?: Record<string, (row: Row) => Joint> }

export type Motion = { pos: Vec3; rot: Quat; vel: Vec3; spin: Vec3; awake: boolean }
export type Push = { impulse?: Vec3; point?: Vec3; angular?: Vec3 }
export type Hit = { with: number; point: Vec3; normal: Vec3; speed: number }
export type QueryFilter = Partial<{ categoryBits: number; maskBits: number }>
export type RayHit = { id: number; point: Vec3; normal: Vec3; fraction: number }
export type Plane = { normal: Vec3; offset: number; point: Vec3 }
export type CollisionPlane = { plane: { normal: Vec3; offset: number }; pushLimit: number; push: number; clipVelocity: boolean }

// ---------------------------------------------------------------- staticAt

// Whether the point [x, y, z] is inside one of the world's `static` bodies, as its shapes lie in
// the world. A point on a surface is not inside. It is what a rule or a check asks of the place
// that never moves: whether a thing put somewhere is in a wall. It answers for a box, a sphere and
// a capsule; any other shape is not asked of.
export function staticAt(world: Pick<World, 'static'>, point: number[]): boolean {
  return world.static.some(b => b.shapes.some(shape => {
    if (!('box' in shape || 'sphere' in shape || 'capsule' in shape) || ('box' in shape && (shape.pos || shape.rot || shape.scale))) return false
    // The point in the body's frame: moved by -pos, then turned by the inverse of rot.
    const p = unturn(b.rot, point.map((c, k) => c - b.pos[k]))
    if ('box' in shape) return p.every((c, k) => Math.abs(c) < shape.box[k])
    if ('sphere' in shape) return math.hypot(...p.map((c, k) => c - shape.sphere.center[k])) < shape.sphere.radius
    const { center1: a, center2: e, radius } = shape.capsule
    const ab = e.map((c, k) => c - a[k]), ap = p.map((c, k) => c - a[k])
    const len = ab.reduce((sum, c) => sum + c * c, 0)
    const t = len === 0 ? 0 : Math.max(0, Math.min(1, ab.reduce((sum, c, k) => sum + c * ap[k], 0) / len))
    return math.hypot(...ap.map((c, k) => c - ab[k] * t)) < radius
  }))
}

// v turned by the inverse of the quaternion q.
function unturn(q: number[], v: number[]): number[] {
  const [qx, qy, qz, qw] = q
  const [ix, iy, iz] = [-qx, -qy, -qz]
  const t = [2 * (iy * v[2] - iz * v[1]), 2 * (iz * v[0] - ix * v[2]), 2 * (ix * v[1] - iy * v[0])]
  return [
    v[0] + qw * t[0] + (iy * t[2] - iz * t[1]),
    v[1] + qw * t[1] + (iz * t[0] - ix * t[2]),
    v[2] + qw * t[2] + (ix * t[1] - iy * t[0]),
  ]
}

// The static bodies alone, as a world of their own, for the shapes staticAt asks of Box3D, each
// shape keyed by itself so a point is tested against the one shape asked of. Kept per `static`
// list; a list edited is a new list, and a new world.
const alone = new WeakMap<Static[], { world: b3WorldId; shapes: Map<Shape, b3ShapeId> }>()
function aloneOf(list: Static[], from: W | Wire | undefined) {
  let s = alone.get(list)
  if (s) return s
  const world = b3.b3CreateWorld(b3.b3DefaultWorldDef())
  const shapes = new Map<Shape, b3ShapeId>()
  const keep: Keep = []
  for (const b of list) {
    const bd = b3.b3DefaultBodyDef()
    bd.position = b.pos
    bd.rotation = b.rot
    const id = b3.b3CreateBody(world, bd)
    for (const sh of b.shapes) shapes.set(sh, makeShape(id, sh, keep, from))
  }
  s = { world, shapes }
  alone.set(list, s)
  unmade.register(list, { world, keep })
  return s
}

// Static body i's shape as it lies in the world, as groups of points, each group a convex piece
// whose hull is the shape's there: a sphere as its centre and the six points a radius off it along
// the axes, a capsule as its two spheres so, a hull-shaped one (a box, a hull, a cylinder, a cone,
// a rock) as its hull's vertices, each child of a compound as its own, a mesh as each of its
// triangles, and a height field as the corners of its bounds. It is what a view from above draws.
export function outline(list: Static[], i: number, shape: Shape, from?: W | Wire): Vec3[][] {
  const s = aloneOf(list, from)
  const id = s.shapes.get(list[i].shapes.find(sh => sh === shape)!)!
  const body = b3.b3Shape_GetBody(id)
  const at = (p: number[]) => b3.b3Body_GetWorldPoint([0, 0, 0], body, [p[0], p[1], p[2]])
  const ball = (c: Vec3, r: number) => [c, ...[0, 1, 2].flatMap(k => [-1, 1].map(sign => c.map((x, j) => j === k ? x + sign * r : x) as Vec3))].map(at)
  if ('sphere' in shape) return [ball(shape.sphere.center, shape.sphere.radius)]
  if ('capsule' in shape) return [[...ball(shape.capsule.center1, shape.capsule.radius), ...ball(shape.capsule.center2, shape.capsule.radius)]]
  if ('mesh' in shape) {
    const mesh = meshData(shape.mesh, from)!
    const scale = shape.mesh.scale ?? [1, 1, 1]
    const v = b3.b3GetMeshVertices(mesh), ix = b3.b3GetMeshIndices(mesh)
    const point = (n: number) => at([v[3 * n] * scale[0], v[3 * n + 1] * scale[1], v[3 * n + 2] * scale[2]])
    const tris: Vec3[][] = []
    for (let t = 0; t + 2 < ix.length; t += 3) tris.push([point(ix[t]), point(ix[t + 1]), point(ix[t + 2])])
    b3.b3DestroyMesh(mesh)
    return tris
  }
  if ('heightField' in shape) {
    const [x0, y0, z0, x1, y1, z1] = b3.b3Shape_GetAABB([0, 0, 0, 0, 0, 0], id)
    return [[0, 1].flatMap(a => [0, 1].flatMap(b => [0, 1].map(c => [a ? x1 : x0, b ? y1 : y0, c ? z1 : z0] as Vec3)))]
  }
  if ('compound' in shape) return shape.compound.hulls.map(h => {
    const hull = b3.b3CreateHull(h.points)!
    const pts = [...b3.b3GetHullVertices(hull)]
    b3.b3DestroyHull(hull)
    const out: Vec3[] = []
    for (let k = 0; k + 2 < pts.length; k += 3) out.push(at(turn(h.rot, [pts[k], pts[k + 1], pts[k + 2]]).map((c, j) => c + h.pos[j])))
    return out
  })
  const flat: number[] = [...b3.b3Shape_GetHullVertices(id)]
  const out: Vec3[] = []
  for (let k = 0; k + 2 < flat.length; k += 3) out.push(at([flat[k], flat[k + 1], flat[k + 2]]))
  return [out]
}

// v turned by the quaternion q.
const turn = (q: number[], v: number[]) => unturn([-q[0], -q[1], -q[2], q[3]], v)
// ---------------------------------------------------------------- the world

const TYPE = { dynamic: b3.b3BodyType.b3_dynamicBody, kinematic: b3.b3BodyType.b3_kinematicBody, static: b3.b3BodyType.b3_staticBody }

// Triangle, height and compound data a world's shapes point at: Box3D keeps a pointer to it, not a
// copy, so it lives as long as the world and is freed after it.
type Keep = { destroy(): void }[]

// A body, and what box3d last wrote to or pushed from its row: a field that differs from it, a rule
// wrote.
type Held = Motion & { id: b3BodyId; kind: string; live: Record<string, unknown>; sensors: boolean; contacts: boolean; hits: boolean; touching: Map<number, number>; visitors: Map<number, number> }
type Tied = { id: b3JointId; type: JointType; a: number; b: number; live: Record<string, unknown>; j: Joint }
type Made = {
  world: b3WorldId
  statics: b3BodyId[]
  bodies: Map<number, Held>
  joints: Map<number, Tied>
  owner: Map<string, number> // a body's or a shape's key to the row, or -(i + 1) for static body i
  oneWay: Map<string, Vec3>
  chunks: Map<string, { ids: b3BodyId[]; keep: Keep }> // the ground's chunks the world holds, by key: the ground's body, then each of its props'
  live: Record<string, unknown>
  keep: Keep
  events: ReturnType<typeof b3.createEventsBuffer>
}

// Keyed by the box3d row, so each truth has its own world.
const made = new WeakMap<Row, Made>()
const unmade = new FinalizationRegistry<{ world: b3WorldId; keep: Keep; events?: ReturnType<typeof b3.createEventsBuffer> }>(m => {
  b3.b3DestroyWorld(m.world)
  for (const k of m.keep) k.destroy()
  if (m.events) b3.destroyEventsBuffer(m.events)
})

const key = (id: { index1: number; generation: number }) => `${id.index1}:${id.generation}`
const v3 = (a: Vec3): Vec3 => [a[0], a[1], a[2]]
const q4 = (a: Quat): Quat => [a[0], a[1], a[2], a[3]]
const copy = (d: Motion): Motion => ({ pos: v3(d.pos), rot: q4(d.rot), vel: v3(d.vel), spin: v3(d.spin), awake: d.awake })
const same = (a: number[], b: number[]) => a.every((c, i) => c === b[i])
const equal = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)
const big = (n: number) => BigInt(n)
const IDENTITY: Frame = { pos: [0, 0, 0], rot: [0, 0, 0, 1] }
const transform = (f: Frame) => ({ position: v3(f.pos), quaternion: q4(f.rot) })

function queryFilter(f: QueryFilter = {}) {
  const q = b3.b3DefaultQueryFilter()
  if (f.categoryBits !== undefined) q.categoryBits = big(f.categoryBits)
  if (f.maskBits !== undefined) q.maskBits = big(f.maskBits)
  return q
}

function meshData(m: Mesh, w: W | Wire | undefined) {
  if ('positions' in m) return b3.b3CreateMesh(new Float32Array(m.positions), new Uint32Array(m.indices))
  if ('asset' in m) {
    if (!w) throw new Error(`mesh asset ${m.asset} is read through the loader: hand outline a rule's w or a page's wire`)
    const f = json(w, m.asset)
    return b3.b3CreateMesh(new Float32Array(f.positions), new Uint32Array(f.indices))
  }
  switch (m.make) {
    case 'box': return b3.b3CreateBoxMesh(m.center, m.extent, m.identifyEdges)
    case 'hollowBox': return b3.b3CreateHollowBoxMesh(m.center, m.extent)
    case 'grid': return b3.b3CreateGridMesh(m.xCount, m.zCount, m.cellWidth, m.materialCount, m.identifyEdges)
    case 'wave': return b3.b3CreateWaveMesh(m.xCount, m.zCount, m.cellWidth, m.amplitude, m.rowFrequency, m.columnFrequency)
    case 'torus': return b3.b3CreateTorusMesh(m.radialResolution, m.tubularResolution, m.radius, m.thickness)
    case 'platform': return b3.b3CreatePlatformMesh(m.center, m.height, m.topWidth, m.bottomWidth)
  }
}

function heightData(h: HeightField, w: W | Wire | undefined) {
  if ('heights' in h) return b3.b3CreateHeightField(new Float32Array(h.heights), h.countX, h.countZ, h.scale)
  if ('asset' in h) {
    if (!w) throw new Error(`height field asset ${h.asset} is read through the loader: hand outline a rule's w or a page's wire`)
    const f = json(w, h.asset)
    return b3.b3CreateHeightField(new Float32Array(f.heights), f.countX, f.countZ, h.scale)
  }
  if (h.make === 'grid') return b3.b3CreateGrid(h.rowCount, h.columnCount, h.scale, h.makeHoles)
  return b3.b3CreateWave(h.rowCount, h.columnCount, h.scale, h.rowFrequency, h.columnFrequency, h.makeHoles)
}

const boxPoints = ([x, y, z]: Vec3) => [-x, -y, -z, x, -y, -z, x, -y, z, -x, -y, z, -x, y, -z, x, y, -z, x, y, z, -x, y, z]

function hullOf(g: Geometry) {
  if ('box' in g) return b3.b3CreateHull(boxPoints(g.box))
  if ('hull' in g) return b3.b3CreateHull(g.hull.points)
  if ('cylinder' in g) return b3.b3CreateCylinder(g.cylinder.height, g.cylinder.radius, g.cylinder.yOffset, g.cylinder.sides)
  if ('cone' in g) return b3.b3CreateCone(g.cone.height, g.cone.radius1, g.cone.radius2, g.cone.slices)
  if ('rock' in g) return b3.b3CreateRock(g.rock.radius)
  throw new Error('not a hull')
}

function shapeDef(s: Shape) {
  const def = b3.b3DefaultShapeDef()
  if (s.density !== undefined) def.density = s.density
  if (s.baseMaterial) {
    const { userMaterialId, ...rest } = s.baseMaterial
    def.baseMaterial = { ...def.baseMaterial, ...rest, ...(userMaterialId === undefined ? {} : { userMaterialId: big(userMaterialId) }) }
  }
  if (s.explosionScale !== undefined) def.explosionScale = s.explosionScale
  if (s.filter) {
    const f = s.filter
    def.filter = {
      categoryBits: f.categoryBits === undefined ? def.filter.categoryBits : big(f.categoryBits),
      maskBits: f.maskBits === undefined ? def.filter.maskBits : big(f.maskBits),
      groupIndex: f.groupIndex ?? def.filter.groupIndex,
    }
  }
  for (const k of ['isSensor', 'enableSensorEvents', 'enableContactEvents', 'enableHitEvents', 'invokeContactCreation', 'updateBodyMass'] as const) {
    if (s[k] !== undefined) def[k] = s[k]!
  }
  if (s.oneWay) def.enablePreSolveEvents = true
  return def
}

function makeShape(body: b3BodyId, s: Shape, keep: Keep, w: W | Wire | undefined): b3ShapeId {
  const def = shapeDef(s)
  if ('sphere' in s) return b3.b3CreateSphereShape(body, def, s.sphere)
  if ('capsule' in s) return b3.b3CreateCapsuleShape(body, def, s.capsule)
  if ('box' in s && !s.pos && !s.rot && !s.scale) return b3.b3CreateBoxShape(body, def, s.box[0], s.box[1], s.box[2])
  if ('box' in s || 'hull' in s || 'cylinder' in s || 'cone' in s || 'rock' in s) {
    const hull = hullOf(s)
    if (!hull) throw new Error(`Box3D could not make a hull of ${JSON.stringify(s)}`)
    // A hull is copied into the world, so it is freed the moment the shape is made.
    const id = s.pos || s.rot || s.scale
      ? b3.b3CreateTransformedHullShape(body, def, hull, transform({ pos: s.pos ?? [0, 0, 0], rot: s.rot ?? [0, 0, 0, 1] }), s.scale ?? [1, 1, 1])
      : b3.b3CreateHullShape(body, def, hull)
    b3.b3DestroyHull(hull)
    return id
  }
  if ('mesh' in s) {
    const mesh = meshData(s.mesh, w)
    if (!mesh) throw new Error(`Box3D could not make a mesh of ${JSON.stringify(s.mesh)}`)
    keep.push({ destroy: () => b3.b3DestroyMesh(mesh) })
    return b3.b3CreateMeshShape(body, def, mesh, s.mesh.scale ?? [1, 1, 1])
  }
  if ('heightField' in s) {
    const field = heightData(s.heightField, w)
    if (!field) throw new Error(`Box3D could not make a height field of ${JSON.stringify(s.heightField)}`)
    keep.push({ destroy: () => b3.b3DestroyHeightField(field) })
    return b3.b3CreateHeightFieldShape(body, def, field)
  }
  if (b3.b3Body_GetType(body).value !== TYPE.static.value) throw new Error('a compound shape is only for a static body, as Box3D allows')
  const hulls = s.compound.hulls.map(h => ({ hull: b3.b3CreateHull(h.points)!, transform: transform(h) }))
  const compound = b3.b3CreateCompound({ hulls })
  if (!compound) throw new Error(`Box3D could not make a compound of ${JSON.stringify(s.compound)}`)
  keep.push({ destroy: () => { b3.b3DestroyCompound(compound); for (const h of hulls) b3.b3DestroyHull(h.hull) } })
  return b3.b3CreateCompoundShape(body, def, compound)
}

// The world's fields a live world can be given, each with what gives it.
const WORLD_LIVE: [string[], (world: b3WorldId, ...v: any[]) => void][] = [
  [['gravity'], (w, g) => b3.b3World_SetGravity(w, g)],
  [['restitutionThreshold'], (w, v) => b3.b3World_SetRestitutionThreshold(w, v)],
  [['hitEventThreshold'], (w, v) => b3.b3World_SetHitEventThreshold(w, v)],
  [['contactHertz', 'contactDampingRatio', 'contactSpeed'], (w, h, d, s) => b3.b3World_SetContactTuning(w, h, d, s)],
  [['maximumLinearSpeed'], (w, v) => b3.b3World_SetMaximumLinearSpeed(w, v)],
  [['enableSleep'], (w, v) => b3.b3World_EnableSleeping(w, v)],
  [['enableContinuous'], (w, v) => b3.b3World_EnableContinuous(w, v)],
  [['enableWarmStarting'], (w, v) => b3.b3World_EnableWarmStarting(w, v)],
  [['enableSpeculative'], (w, v) => b3.b3World_EnableSpeculative(w, v)],
  [['contactRecycleDistance'], (w, v) => b3.b3World_SetContactRecycleDistance(w, v)],
]

function make(me: Row, w: W): Made {
  const d: World = w.world.box3d
  const def = b3.b3DefaultWorldDef()
  for (const k of ['gravity', 'restitutionThreshold', 'hitEventThreshold', 'contactHertz', 'contactDampingRatio', 'contactSpeed', 'maximumLinearSpeed', 'enableSleep', 'enableContinuous'] as const) {
    if (d[k] !== undefined) (def as any)[k] = d[k]
  }
  if (d.capacity) def.capacity = { ...def.capacity, ...d.capacity }
  const world = b3.b3CreateWorld(def)
  if (d.enableWarmStarting !== undefined) b3.b3World_EnableWarmStarting(world, d.enableWarmStarting)
  if (d.enableSpeculative !== undefined) b3.b3World_EnableSpeculative(world, d.enableSpeculative)
  if (d.contactRecycleDistance !== undefined) b3.b3World_SetContactRecycleDistance(world, d.contactRecycleDistance)
  const m: Made = {
    world, statics: [], bodies: new Map(), joints: new Map(), owner: new Map(), oneWay: new Map(), chunks: new Map(),
    live: {}, keep: [], events: b3.createEventsBuffer(),
  }
  d.static.forEach((s, i) => m.statics.push(place(m, s, -(i + 1), m.keep, w)))
  // A contact on a one-way shape is kept while the other shape is on the face that looks along
  // `oneWay`: the contact normal, which points from shape A to shape B, pointing out of that face.
  b3.b3World_SetPreSolveCallback(world, (a: b3ShapeId, b: b3ShapeId, _point: Vec3, normal: Vec3) => {
    const wayA = m.oneWay.get(key(a)), wayB = m.oneWay.get(key(b))
    if (wayA && dot(worldVector(b3.b3Shape_GetBody(a), wayA), normal) <= 0) return false
    if (wayB && dot(worldVector(b3.b3Shape_GetBody(b), wayB), normal) >= 0) return false
    return true
  })
  made.set(me, m)
  unmade.register(me, { world, keep: m.keep, events: m.events }, m)
  return m
}

// What a truth's snapshot does not carry of box3d (`Memory` in the scenemanager addon): the whole
// Box3D world as Box3D's own snapshot image (bodies, shapes, contacts with their warm starting
// impulses, islands, sleep, the broad phase), and box3d's tables beside it, which row each body,
// shape and joint is and what box3d last pushed from each row. The image is the bytes Box3D wrote, a
// `Uint8Array`, kept as they are from step to step and carried as they are across the socket; the
// tables are plain JSON.
type Memo = {
  image: Uint8Array
  statics: b3BodyId[]
  bodies: [number, Omit<Held, 'touching' | 'visitors'> & { touching: [number, number][]; visitors: [number, number][] }][]
  joints: [number, Tied][]
  owner: [string, number][]
  oneWay: [string, Vec3][]
  chunks: [string, b3BodyId[]][]
  live: Record<string, unknown>
}
// A memo handed to a box3d row of a truth loaded from a snapshot, for its next step to restore.
const taken = new WeakMap<Row, Memo>()

// The world of the row a truth held before it loaded a snapshot, moved to the row of the same id
// that the load put in its place, so the restore puts the image into the world there is rather than
// a new one: a server that rewinds every few steps, or a page that takes the server's truth back,
// would otherwise make a world each time, and Box3D holds a fixed number of worlds.
function move(was: Row, me: Row) {
  const m = made.get(was)
  if (!m) return
  made.delete(was)
  made.set(me, m)
  unmade.unregister(m)
  unmade.register(me, { world: m.world, keep: m.keep, events: m.events }, m)
}

// The image is Box3D's own copy, made for this call (b3World_GetSnapshot hands back a fresh array),
// so only the tables are cloned off the live ones.
function hold(me: Row): Memo | undefined {
  const m = made.get(me)
  if (!m) return undefined
  const image = b3.b3World_GetSnapshot(m.world)
  if (!image.length) throw new Error('box3d: the world is mid step and cannot be saved')
  return { image, ...structuredClone({
    statics: m.statics,
    bodies: [...m.bodies].map(([id, h]) => [id, { ...h, touching: [...h.touching], visitors: [...h.visitors] }]),
    joints: [...m.joints],
    owner: [...m.owner],
    oneWay: [...m.oneWay],
    chunks: [...m.chunks].map(([key, c]) => [key, c.ids]),
    live: m.live,
  }) as Omit<Memo, 'image'> }
}

// The row's world, or one made for it, put back to the memo's image, and box3d's tables taken from
// the memo, every id re-pointed at this world, since a body's id names the world it is in. The statics
// and ground chunks the image holds point at geometry the image carried, which Box3D keeps for the
// world, so a chunk taken here has nothing of its own to free, and the geometry box3d made for the
// world before, which no shape points at any more, is let go.
function restore(me: Row, w: W): Made {
  const memo = taken.get(me)!
  taken.delete(me)
  const m = made.get(me) ?? make(me, w)
  if (!b3.b3World_Restore(m.world, memo.image)) throw new Error('box3d: the snapshot image would not restore')
  for (const c of m.chunks.values()) for (const k of c.keep) k.destroy()
  for (const k of m.keep.splice(0)) k.destroy()
  const here = <T extends { world0: number }>(id: T): T => ({ ...id, world0: m.world.index1 - 1 })
  m.statics = memo.statics.map(here)
  m.bodies = new Map(memo.bodies.map(([id, h]) => [id, { ...h, id: here(h.id), touching: new Map(h.touching), visitors: new Map(h.visitors) }]))
  m.joints = new Map(memo.joints.map(([id, j]) => [id, { ...j, id: here(j.id) }]))
  m.owner = new Map(memo.owner)
  m.oneWay = new Map(memo.oneWay)
  m.chunks = new Map(memo.chunks.map(([key, ids]) => [key, { ids: ids.map(here), keep: [] }]))
  m.live = memo.live
  return m
}

// A static body in the world, named `as`, its shapes' data kept in `keep`.
function place(m: Made, s: Static, as: number, keep: Keep, w: W): b3BodyId {
  const bd = b3.b3DefaultBodyDef()
  bd.position = s.pos
  bd.rotation = s.rot
  const id = b3.b3CreateBody(m.world, bd)
  m.owner.set(key(id), as)
  for (const sh of s.shapes) {
    const sid = makeShape(id, sh, keep, w)
    m.owner.set('s' + key(sid), as)
    if (sh.oneWay) m.oneWay.set(key(sid), sh.oneWay)
  }
  return id
}

// The ground's chunks to what the box3d row lists: each listed key it lacks built by the scene's
// `ground` mod and each of its `props` mods, each it holds that is not listed dropped, every body of
// it, and the data its shapes pointed at freed.
function chunks(m: Made, listed: number[][], w: W) {
  const want = new Map(listed.map(k => [`${k[0]},${k[1]}`, k]))
  for (const [k, c] of m.chunks) {
    if (want.has(k)) continue
    for (const id of c.ids) unplace(m, id)
    for (const f of c.keep) f.destroy()
    m.chunks.delete(k)
  }
  if (![...want.keys()].some(k => !m.chunks.has(k))) return
  const ground = mod<(w: W, key: number[]) => Static>(w.world, 'box3d', 'ground')
  if (!ground) throw new Error('the box3d row lists ground chunks, and the scene gives box3d no ground mod (world.box3d.mods.ground)')
  const props = modsOf<(w: W, key: number[]) => Static | undefined>(w.world, 'box3d', 'props')
  for (const [k, at] of want) {
    if (m.chunks.has(k)) continue
    const keep: Keep = []
    const ids = [place(m, ground(w, at), 0, keep, w)]
    for (const prop of props) {
      const s = prop(w, at)
      if (s) ids.push(place(m, s, 0, keep, w))
    }
    m.chunks.set(k, { ids, keep })
  }
}

// A body out of the world, and out of every table naming it or its shapes.
function unplace(m: Made, id: b3BodyId) {
  const shapes = b3.b3Body_GetShapes(id)
  for (const s of shapes) { m.owner.delete('s' + key(s)); m.oneWay.delete(key(s)) }
  shapes.delete()
  m.owner.delete(key(id))
  b3.b3DestroyBody(id)
}

const dot = (a: number[], b: number[]) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const worldVector = (body: b3BodyId, v: Vec3) => b3.b3Body_GetWorldVector([0, 0, 0], body, v)

// ---------------------------------------------------------------- bodies

// A body's fields Box3D can change on a live body, each with what changes it. The row's value, or
// else its kind's, is what the body is given.
const BODY_LIVE: Record<string, (id: b3BodyId, v: any) => void> = {
  type: (id, v: BodyType) => b3.b3Body_SetType(id, TYPE[v]),
  enabled: (id, v: boolean) => v ? b3.b3Body_Enable(id) : b3.b3Body_Disable(id),
  linearDamping: (id, v) => b3.b3Body_SetLinearDamping(id, v),
  angularDamping: (id, v) => b3.b3Body_SetAngularDamping(id, v),
  gravityScale: (id, v) => b3.b3Body_SetGravityScale(id, v),
  sleepThreshold: (id, v) => b3.b3Body_SetSleepThreshold(id, v),
  motionLocks: (id, v: Partial<b3MotionLocks>) => b3.b3Body_SetMotionLocks(id, { ...b3.b3Body_GetMotionLocks(id), ...v }),
  enableSleep: (id, v) => b3.b3Body_EnableSleep(id, v),
  isBullet: (id, v) => b3.b3Body_SetBullet(id, v),
  enableContactRecycling: (id, v) => b3.b3Body_EnableContactRecycling(id, v),
  enableHitEvents: (id, v) => b3.b3Body_EnableHitEvents(id, v),
  name: (id, v) => b3.b3Body_SetName(id, v),
  friction: (id, v: number) => {
    const shapes = b3.b3Body_GetShapes(id)
    for (const s of shapes) b3.b3Shape_SetFriction(s, v)
    shapes.delete()
  },
}

function body(m: Made, row: Row, k: Body, w: W): Held {
  const d = row.data as Motion & Record<string, any>
  const bd = b3.b3DefaultBodyDef()
  const type: BodyType | undefined = d.type ?? k.type
  if (type) bd.type = TYPE[type]
  bd.position = v3(d.pos)
  bd.rotation = q4(d.rot)
  bd.linearVelocity = v3(d.vel)
  bd.angularVelocity = v3(d.spin)
  bd.isAwake = d.awake
  for (const f of ['linearDamping', 'angularDamping', 'gravityScale', 'sleepThreshold', 'enableSleep', 'isBullet', 'allowFastRotation', 'enableContactRecycling'] as const) {
    const v = d[f] ?? k[f]
    if (v !== undefined) (bd as any)[f] = v
  }
  const locks = d.motionLocks ?? k.motionLocks
  if (locks) bd.motionLocks = { ...bd.motionLocks, ...locks }
  if (d.enabled !== undefined) bd.isEnabled = d.enabled
  const id = b3.b3CreateBody(m.world, bd)
  const name = d.name ?? k.name
  if (name !== undefined) b3.b3Body_SetName(id, name)
  const hitsOn = d.enableHitEvents ?? k.enableHitEvents
  if (hitsOn !== undefined) b3.b3Body_EnableHitEvents(id, hitsOn)
  m.owner.set(key(id), row.id)
  for (const s of k.shapes) {
    const sid = makeShape(id, s, m.keep, w)
    m.owner.set('s' + key(sid), row.id)
    if (s.oneWay) m.oneWay.set(key(sid), s.oneWay)
  }
  if (k.mass) b3.b3Body_SetMassData(id, k.mass)
  if (d.friction !== undefined) BODY_LIVE.friction(id, d.friction)
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
  const moved = !same(h.pos, d.pos) || !same(h.rot, d.rot)
  const sped = !same(h.vel, d.vel)
  const spun = !same(h.spin, d.spin)
  if (moved) b3.b3Body_SetTransform(h.id, d.pos, d.rot)
  if (sped) b3.b3Body_SetLinearVelocity(h.id, d.vel)
  if (spun) b3.b3Body_SetAngularVelocity(h.id, d.spin)
  if (d.awake !== h.awake) b3.b3Body_SetAwake(h.id, d.awake)
  else if (moved || sped || spun) b3.b3Body_SetAwake(h.id, true)
  // A held force or torque wakes the body only while it is not being told to sleep this step.
  const rouse = d.awake || d.awake === h.awake
  if (d.force) b3.b3Body_ApplyForceToCenter(h.id, d.force, rouse)
  if (d.torque) b3.b3Body_ApplyTorque(h.id, d.torque, rouse)
  if (d.pushes) {
    for (const p of d.pushes as Push[]) {
      if (p.impulse) {
        if (p.point) b3.b3Body_ApplyLinearImpulse(h.id, p.impulse, p.point, true)
        else b3.b3Body_ApplyLinearImpulseToCenter(h.id, p.impulse, true)
      }
      if (p.angular) b3.b3Body_ApplyAngularImpulse(h.id, p.angular, true)
    }
    delete d.pushes
  }
  if (d.target) b3.b3Body_SetTargetTransform(h.id, transform(d.target), dt, true)
  if (d.wind) {
    const shapes = b3.b3Body_GetShapes(h.id)
    for (const s of shapes) b3.b3Shape_ApplyWind(s, d.wind.wind, d.wind.drag, d.wind.lift, d.wind.maxSpeed, true)
    shapes.delete()
  }
}

function pull(h: Held, d: Motion & Record<string, any>) {
  d.pos = b3.b3Body_GetPosition([0, 0, 0], h.id)
  d.rot = b3.b3Body_GetRotation([0, 0, 0, 1], h.id)
  d.vel = b3.b3Body_GetLinearVelocity([0, 0, 0], h.id)
  d.spin = b3.b3Body_GetAngularVelocity([0, 0, 0], h.id)
  d.awake = b3.b3Body_IsAwake(h.id)
  Object.assign(h, copy(d))
  const list = (counts: Map<number, number>) => [...counts.keys()].sort((a, b) => a - b)
  if (h.contacts) { if (h.touching.size) d.touching = list(h.touching); else delete d.touching }
  if (h.sensors) { if (h.visitors.size) d.visitors = list(h.visitors); else delete d.visitors }
}

// ---------------------------------------------------------------- joints

type Setter = [string[], (id: b3JointId, ...v: any[]) => void]
const BASE_LIVE: Setter[] = [
  [['collideConnected'], (id, v) => b3.b3Joint_SetCollideConnected(id, v)],
  [['constraintHertz', 'constraintDampingRatio'], (id, h, d) => b3.b3Joint_SetConstraintTuning(id, h, d)],
  [['forceThreshold'], (id, v) => b3.b3Joint_SetForceThreshold(id, v)],
  [['torqueThreshold'], (id, v) => b3.b3Joint_SetTorqueThreshold(id, v)],
  [['localFrameA'], (id, f: Frame) => b3.b3Joint_SetLocalFrameA(id, transform(f))],
  [['localFrameB'], (id, f: Frame) => b3.b3Joint_SetLocalFrameB(id, transform(f))],
]
const JOINT_LIVE: Record<JointType, Setter[]> = {
  distance: [
    [['length'], (id, v) => b3.b3DistanceJoint_SetLength(id, v)],
    [['enableSpring'], (id, v) => b3.b3DistanceJoint_EnableSpring(id, v)],
    [['lowerSpringForce', 'upperSpringForce'], (id, lo, hi) => b3.b3DistanceJoint_SetSpringForceRange(id, lo, hi)],
    [['hertz'], (id, v) => b3.b3DistanceJoint_SetSpringHertz(id, v)],
    [['dampingRatio'], (id, v) => b3.b3DistanceJoint_SetSpringDampingRatio(id, v)],
    [['enableLimit'], (id, v) => b3.b3DistanceJoint_EnableLimit(id, v)],
    [['minLength', 'maxLength'], (id, lo, hi) => b3.b3DistanceJoint_SetLengthRange(id, lo, hi)],
    [['enableMotor'], (id, v) => b3.b3DistanceJoint_EnableMotor(id, v)],
    [['maxMotorForce'], (id, v) => b3.b3DistanceJoint_SetMaxMotorForce(id, v)],
    [['motorSpeed'], (id, v) => b3.b3DistanceJoint_SetMotorSpeed(id, v)],
  ],
  revolute: [
    [['targetAngle'], (id, v) => b3.b3RevoluteJoint_SetTargetAngle(id, v)],
    [['enableSpring'], (id, v) => b3.b3RevoluteJoint_EnableSpring(id, v)],
    [['hertz'], (id, v) => b3.b3RevoluteJoint_SetSpringHertz(id, v)],
    [['dampingRatio'], (id, v) => b3.b3RevoluteJoint_SetSpringDampingRatio(id, v)],
    [['enableLimit'], (id, v) => b3.b3RevoluteJoint_EnableLimit(id, v)],
    [['lowerAngle', 'upperAngle'], (id, lo, hi) => b3.b3RevoluteJoint_SetLimits(id, lo, hi)],
    [['enableMotor'], (id, v) => b3.b3RevoluteJoint_EnableMotor(id, v)],
    [['maxMotorTorque'], (id, v) => b3.b3RevoluteJoint_SetMaxMotorTorque(id, v)],
    [['motorSpeed'], (id, v) => b3.b3RevoluteJoint_SetMotorSpeed(id, v)],
  ],
  prismatic: [
    [['enableSpring'], (id, v) => b3.b3PrismaticJoint_EnableSpring(id, v)],
    [['hertz'], (id, v) => b3.b3PrismaticJoint_SetSpringHertz(id, v)],
    [['dampingRatio'], (id, v) => b3.b3PrismaticJoint_SetSpringDampingRatio(id, v)],
    [['targetTranslation'], (id, v) => b3.b3PrismaticJoint_SetTargetTranslation(id, v)],
    [['enableLimit'], (id, v) => b3.b3PrismaticJoint_EnableLimit(id, v)],
    [['lowerTranslation', 'upperTranslation'], (id, lo, hi) => b3.b3PrismaticJoint_SetLimits(id, lo, hi)],
    [['enableMotor'], (id, v) => b3.b3PrismaticJoint_EnableMotor(id, v)],
    [['maxMotorForce'], (id, v) => b3.b3PrismaticJoint_SetMaxMotorForce(id, v)],
    [['motorSpeed'], (id, v) => b3.b3PrismaticJoint_SetMotorSpeed(id, v)],
  ],
  wheel: [
    [['enableSuspensionSpring'], (id, v) => b3.b3WheelJoint_EnableSuspension(id, v)],
    [['suspensionHertz'], (id, v) => b3.b3WheelJoint_SetSuspensionHertz(id, v)],
    [['suspensionDampingRatio'], (id, v) => b3.b3WheelJoint_SetSuspensionDampingRatio(id, v)],
    [['enableSuspensionLimit'], (id, v) => b3.b3WheelJoint_EnableSuspensionLimit(id, v)],
    [['lowerSuspensionLimit', 'upperSuspensionLimit'], (id, lo, hi) => b3.b3WheelJoint_SetSuspensionLimits(id, lo, hi)],
    [['enableSpinMotor'], (id, v) => b3.b3WheelJoint_EnableSpinMotor(id, v)],
    [['maxSpinTorque'], (id, v) => b3.b3WheelJoint_SetMaxSpinTorque(id, v)],
    [['spinSpeed'], (id, v) => b3.b3WheelJoint_SetSpinMotorSpeed(id, v)],
    [['enableSteering'], (id, v) => b3.b3WheelJoint_EnableSteering(id, v)],
    [['steeringHertz'], (id, v) => b3.b3WheelJoint_SetSteeringHertz(id, v)],
    [['steeringDampingRatio'], (id, v) => b3.b3WheelJoint_SetSteeringDampingRatio(id, v)],
    [['targetSteeringAngle'], (id, v) => b3.b3WheelJoint_SetTargetSteeringAngle(id, v)],
    [['maxSteeringTorque'], (id, v) => b3.b3WheelJoint_SetMaxSteeringTorque(id, v)],
    [['enableSteeringLimit'], (id, v) => b3.b3WheelJoint_EnableSteeringLimit(id, v)],
    [['lowerSteeringLimit', 'upperSteeringLimit'], (id, lo, hi) => b3.b3WheelJoint_SetSteeringLimits(id, lo, hi)],
  ],
  weld: [
    [['linearHertz'], (id, v) => b3.b3WeldJoint_SetLinearHertz(id, v)],
    [['angularHertz'], (id, v) => b3.b3WeldJoint_SetAngularHertz(id, v)],
    [['linearDampingRatio'], (id, v) => b3.b3WeldJoint_SetLinearDampingRatio(id, v)],
    [['angularDampingRatio'], (id, v) => b3.b3WeldJoint_SetAngularDampingRatio(id, v)],
  ],
  spherical: [
    [['enableSpring'], (id, v) => b3.b3SphericalJoint_EnableSpring(id, v)],
    [['hertz'], (id, v) => b3.b3SphericalJoint_SetSpringHertz(id, v)],
    [['dampingRatio'], (id, v) => b3.b3SphericalJoint_SetSpringDampingRatio(id, v)],
    [['targetRotation'], (id, v) => b3.b3SphericalJoint_SetTargetRotation(id, v)],
    [['enableConeLimit'], (id, v) => b3.b3SphericalJoint_EnableConeLimit(id, v)],
    [['coneAngle'], (id, v) => b3.b3SphericalJoint_SetConeLimit(id, v)],
    [['enableTwistLimit'], (id, v) => b3.b3SphericalJoint_EnableTwistLimit(id, v)],
    [['lowerTwistAngle', 'upperTwistAngle'], (id, lo, hi) => b3.b3SphericalJoint_SetTwistLimits(id, lo, hi)],
    [['enableMotor'], (id, v) => b3.b3SphericalJoint_EnableMotor(id, v)],
    [['maxMotorTorque'], (id, v) => b3.b3SphericalJoint_SetMaxMotorTorque(id, v)],
    [['motorVelocity'], (id, v) => b3.b3SphericalJoint_SetMotorVelocity(id, v)],
  ],
  motor: [
    [['linearVelocity'], (id, v) => b3.b3MotorJoint_SetLinearVelocity(id, v)],
    [['maxVelocityForce'], (id, v) => b3.b3MotorJoint_SetMaxVelocityForce(id, v)],
    [['angularVelocity'], (id, v) => b3.b3MotorJoint_SetAngularVelocity(id, v)],
    [['maxVelocityTorque'], (id, v) => b3.b3MotorJoint_SetMaxVelocityTorque(id, v)],
    [['linearHertz'], (id, v) => b3.b3MotorJoint_SetLinearHertz(id, v)],
    [['linearDampingRatio'], (id, v) => b3.b3MotorJoint_SetLinearDampingRatio(id, v)],
    [['maxSpringForce'], (id, v) => b3.b3MotorJoint_SetMaxSpringForce(id, v)],
    [['angularHertz'], (id, v) => b3.b3MotorJoint_SetAngularHertz(id, v)],
    [['angularDampingRatio'], (id, v) => b3.b3MotorJoint_SetAngularDampingRatio(id, v)],
    [['maxSpringTorque'], (id, v) => b3.b3MotorJoint_SetMaxSpringTorque(id, v)],
  ],
  parallel: [
    [['hertz'], (id, v) => b3.b3ParallelJoint_SetSpringHertz(id, v)],
    [['dampingRatio'], (id, v) => b3.b3ParallelJoint_SetSpringDampingRatio(id, v)],
    [['maxTorque'], (id, v) => b3.b3ParallelJoint_SetMaxTorque(id, v)],
  ],
  filter: [],
}
// What each type of joint reports on its row every step.
const JOINT_READ: Record<JointType, (id: b3JointId) => Record<string, unknown>> = {
  distance: id => ({ currentLength: b3.b3DistanceJoint_GetCurrentLength(id), motorForce: b3.b3DistanceJoint_GetMotorForce(id) }),
  revolute: id => ({ angle: b3.b3RevoluteJoint_GetAngle(id), motorTorque: b3.b3RevoluteJoint_GetMotorTorque(id) }),
  prismatic: id => ({ translation: b3.b3PrismaticJoint_GetTranslation(id), speed: b3.b3PrismaticJoint_GetSpeed(id), motorForce: b3.b3PrismaticJoint_GetMotorForce(id) }),
  wheel: id => ({ spinSpeed: b3.b3WheelJoint_GetSpinSpeed(id), spinTorque: b3.b3WheelJoint_GetSpinTorque(id), steeringAngle: b3.b3WheelJoint_GetSteeringAngle(id), steeringTorque: b3.b3WheelJoint_GetSteeringTorque(id) }),
  weld: () => ({}),
  spherical: id => ({ twistAngle: b3.b3SphericalJoint_GetTwistAngle(id), coneAngle: b3.b3SphericalJoint_GetConeAngle(id), motorTorque: b3.b3SphericalJoint_GetMotorTorque(id) }),
  motor: () => ({}),
  parallel: () => ({}),
  filter: () => ({}),
}
// The fields a row writes for itself or box3d writes back: never a setting of the joint's.
const JOINT_OWN = new Set(['a', 'b', 'measured', 'strained'])

const CREATE: Record<JointType, (world: b3WorldId, def: any) => b3JointId> = {
  distance: (w, d) => b3.b3CreateDistanceJoint(w, d),
  revolute: (w, d) => b3.b3CreateRevoluteJoint(w, d),
  prismatic: (w, d) => b3.b3CreatePrismaticJoint(w, d),
  wheel: (w, d) => b3.b3CreateWheelJoint(w, d),
  weld: (w, d) => b3.b3CreateWeldJoint(w, d),
  spherical: (w, d) => b3.b3CreateSphericalJoint(w, d),
  motor: (w, d) => b3.b3CreateMotorJoint(w, d),
  parallel: (w, d) => b3.b3CreateParallelJoint(w, d),
  filter: (w, d) => b3.b3CreateFilterJoint(w, d),
}
const DEFAULT: Record<JointType, () => any> = {
  distance: () => b3.b3DefaultDistanceJointDef(),
  revolute: () => b3.b3DefaultRevoluteJointDef(),
  prismatic: () => b3.b3DefaultPrismaticJointDef(),
  wheel: () => b3.b3DefaultWheelJointDef(),
  weld: () => b3.b3DefaultWeldJointDef(),
  spherical: () => b3.b3DefaultSphericalJointDef(),
  motor: () => b3.b3DefaultMotorJointDef(),
  parallel: () => b3.b3DefaultParallelJointDef(),
  filter: () => b3.b3DefaultFilterJointDef(),
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
  return { id, type: j.type, a: d.a, b: d.b, live, j }
}

function pushJoint(t: Tied, d: Record<string, any>) {
  const j = t.j
  for (const [fields, set] of [...BASE_LIVE, ...JOINT_LIVE[t.type]]) {
    if (!fields.some(f => f in d && !equal(d[f], t.live[f]))) continue
    // A pair set together, as a limit's two ends, takes the other end from the row, else the kind,
    // else Box3D's default.
    const fallback = DEFAULT[t.type]()
    set(t.id, ...fields.map(f => d[f] ?? (j as any)[f] ?? fallback[f] ?? fallback.base[f]))
    for (const f of fields) if (f in d) t.live[f] = structuredClone(d[f])
    b3.b3Joint_WakeBodies(t.id)
  }
}

function pullJoint(t: Tied, d: Record<string, any>) {
  d.measured = {
    constraintForce: b3.b3Joint_GetConstraintForce([0, 0, 0], t.id),
    constraintTorque: b3.b3Joint_GetConstraintTorque([0, 0, 0], t.id),
    linearSeparation: b3.b3Joint_GetLinearSeparation(t.id),
    angularSeparation: b3.b3Joint_GetAngularSeparation(t.id),
    ...JOINT_READ[t.type](t.id),
  }
}

// ---------------------------------------------------------------- events

const touch = b3.createContactTouchEvent()
const hit = b3.createContactHitEvent()
const sense = b3.createSensorTouchEvent()
const strain = b3.createJointEvent()

const bump = (counts: Map<number, number>, id: number, by: number) => {
  const n = (counts.get(id) ?? 0) + by
  if (n > 0) counts.set(id, n)
  else counts.delete(id)
}

// This step's events, onto what the bodies and joints hold and their rows. A shape of a body whose
// row ended this step is no longer in the world, so its events name no one and are dropped.
function events(m: Made, rows: Map<number, Row>, joints: Map<number, Row>) {
  const eb = b3.getEvents(m.events, m.world)
  const who = (s: b3ShapeId) => m.owner.get('s' + key(s))
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
  pair(1, (o, e, i) => b3.getContactBeginEventAt(o, e, i), b3.getNumContactBeginEvents(eb))
  pair(-1, (o, e, i) => b3.getContactEndEventAt(o, e, i), b3.getNumContactEndEvents(eb))
  const struck = new Map<number, Hit[]>()
  for (let i = 0, n = b3.getNumContactHitEvents(eb); i < n; i++) {
    b3.getContactHitEventAt(hit, eb, i)
    const a = who(hit.shapeIdA), b = who(hit.shapeIdB)
    if (a === undefined || b === undefined) continue
    // The normal points from A to B; each is told of it as it points into itself.
    const blow = (me: number, other: number, normal: Vec3) => {
      if (!m.bodies.get(me)?.hits) return
      struck.set(me, [...(struck.get(me) ?? []), { with: other, point: v3(hit.point), normal, speed: hit.approachSpeed }])
    }
    blow(a, b, [-hit.normal[0], -hit.normal[1], -hit.normal[2]])
    blow(b, a, v3(hit.normal))
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
  sensed(1, (o, e, i) => b3.getSensorBeginEventAt(o, e, i), b3.getNumSensorBeginEvents(eb))
  sensed(-1, (o, e, i) => b3.getSensorEndEventAt(o, e, i), b3.getNumSensorEndEvents(eb))
  const strained = new Set<string>()
  for (let i = 0, n = b3.getNumJointEvents(eb); i < n; i++) {
    b3.getJointEventAt(strain, eb, i)
    strained.add(key(strain.jointId))
  }
  for (const [id, t] of m.joints) {
    const d = joints.get(id)!.data
    if (strained.has(key(t.id))) d.strained = true
    else delete d.strained
  }
}

// ---------------------------------------------------------------- the step

export const box3d: Kind & Memory = {
  // The world and box3d's tables handed out as they stand, the world untouched: for a page that runs
  // the scene ahead, and for every step a server that rewinds keeps (`addons/rewind`).
  hold(me) { return hold(me) },
  // On a truth loaded from a snapshot, the page's copy or a server rewinding: restored from on its
  // next step, into the world the row it replaced had, when it had one.
  take(me, memo, was) {
    if (was) move(was, me)
    taken.set(me, memo as Memo)
  },
  tick(me, dt, w) {
    const d: World = w.world.box3d
    const m = taken.has(me) ? restore(me, w) : made.get(me) ?? make(me, w)
    for (const [fields, set] of WORLD_LIVE) {
      if (!fields.some(f => f in me.data && !equal(me.data[f], m.live[f]))) continue
      set(m.world, ...fields.map(f => me.data[f] ?? (d as any)[f] ?? (b3.b3DefaultWorldDef() as any)[f]))
      for (const f of fields) if (f in me.data) m.live[f] = structuredClone(me.data[f])
    }
    const them = modsOf<(w: W) => Kinds>(w.world, 'box3d', 'kinds').map(f => f(w))
    const bodyOf: Record<string, (row: Row) => Body> = { ...Object.assign({}, ...them.map(t => t.bodies)), ...Object.fromEntries(Object.entries(d.kinds).map(([k, b]) => [k, () => b])) }
    const jointOf: Record<string, (row: Row) => Joint> = { ...Object.assign({}, ...them.map(t => t.joints)), ...Object.fromEntries(Object.entries(d.joints ?? {}).map(([k, j]) => [k, () => j])) }
    const bodies = new Map(Object.keys(bodyOf).flatMap(k => w.all(k)).map(r => [r.id, r]))
    const joints = new Map(Object.keys(jointOf).flatMap(k => w.all(k)).map(r => [r.id, r]))
    // A joint goes before its bodies: Box3D takes a body's joints with it, and a joint of a body
    // gone is remade, if its row asks, once both its ends are bodies again.
    for (const [id, t] of m.joints) {
      const r = joints.get(id)
      if (r && r.data.a === t.a && r.data.b === t.b && (t.a < 0 || bodies.has(t.a)) && (t.b < 0 || bodies.has(t.b))) continue
      if (b3.b3Joint_IsValid(t.id)) b3.b3DestroyJoint(t.id, true)
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
        const made = body(m, row, bodyOf[row.kind](row), w)
        m.bodies.set(row.id, made)
        push(made, row.data, dt)
      }
    }
    for (const row of joints.values()) {
      const t = m.joints.get(row.id)
      if (t) pushJoint(t, row.data)
      else {
        const tied = tie(m, row, jointOf[row.kind](row))
        if (tied) m.joints.set(row.id, tied)
      }
    }
    for (const e of (me.data.explosions ?? []) as number[][]) {
      const [x, y, z, radius, falloff, impulsePerArea, maskBits] = e
      const def = b3.b3DefaultExplosionDef()
      def.position = [x, y, z]
      def.radius = radius
      def.falloff = falloff
      def.impulsePerArea = impulsePerArea
      if (maskBits !== undefined) def.maskBits = big(maskBits)
      b3.b3World_Explode(m.world, def)
    }
    delete me.data.explosions
    b3.b3World_Step(m.world, dt, me.data.subStepCount ?? d.subStepCount)
    events(m, bodies, joints)
    for (const row of bodies.values()) pull(m.bodies.get(row.id)!, row.data)
    for (const [id, row] of joints) {
      const t = m.joints.get(id)
      if (t) pullJoint(t, row.data)
      else { delete row.data.measured; delete row.data.strained }
    }
  },
  acts: {
    // Blows the world apart on the next step: an impulse per area of each shape within `radius`
    // of the point, less by `falloff` towards the edge, on the shapes whose category `maskBits`
    // names (every shape if left out).
    explode(me, _w, _seat, x: number, y: number, z: number, radius: number, falloff: number, impulsePerArea: number, maskBits?: number) {
      me.data.explosions = [...(me.data.explosions ?? []), maskBits === undefined ? [x, y, z, radius, falloff, impulsePerArea] : [x, y, z, radius, falloff, impulsePerArea, maskBits]]
    },
  },
}

// ---------------------------------------------------------------- queries

// The world of the scene's box3d row, as its last step left it.
function worldOf(w: W): Made {
  const m = made.get(w.find('box3d'))
  if (!m) throw new Error('box3d has not stepped yet, so there is no world to ask')
  return m
}
const ownerOf = (m: Made, s: b3ShapeId) => m.owner.get('s' + key(s))!
const heldOf = (m: Made, row: Row) => {
  const h = m.bodies.get(row.id)
  if (!h) throw new Error(`row ${row.id} (${row.kind}) is not a body of box3d's world`)
  return h
}

// The first thing a ray from `origin` along `translation` meets, or undefined.
export function castRayClosest(w: W, origin: Vec3, translation: Vec3, filter?: QueryFilter): RayHit | undefined {
  const m = worldOf(w)
  const r = b3.b3World_CastRayClosest(m.world, origin, translation, queryFilter(filter))
  return r.hit ? { id: ownerOf(m, r.shapeId), point: v3(r.point), normal: v3(r.normal), fraction: r.fraction } : undefined
}

// Everything a ray meets, nearest first; one hit per shape.
export function castRay(w: W, origin: Vec3, translation: Vec3, filter?: QueryFilter): RayHit[] {
  const m = worldOf(w)
  const hits: RayHit[] = []
  b3.b3World_CastRay(m.world, origin, translation, queryFilter(filter), (s: b3ShapeId, point: Vec3, normal: Vec3, fraction: number) => {
    hits.push({ id: ownerOf(m, s), point: v3(point), normal: v3(normal), fraction })
    return 1
  })
  return hits.sort((a, b) => a.fraction - b.fraction || a.id - b.id)
}

// Everything a convex shape — the hull of `points` about `origin`, rounded by `radius` — meets as
// it is swept along `translation`, nearest first.
export function castShape(w: W, origin: Vec3, points: number[], radius: number, translation: Vec3, filter?: QueryFilter): RayHit[] {
  const m = worldOf(w)
  const hits: RayHit[] = []
  b3.b3World_CastShape(m.world, origin, points, radius, translation, queryFilter(filter), (s: b3ShapeId, point: Vec3, normal: Vec3, fraction: number) => {
    hits.push({ id: ownerOf(m, s), point: v3(point), normal: v3(normal), fraction })
    return 1
  })
  return hits.sort((a, b) => a.fraction - b.fraction || a.id - b.id)
}

const unique = (ids: number[]) => [...new Set(ids)].sort((a, b) => a - b)

// The bodies a convex shape at `origin` overlaps.
export function overlapShape(w: W, origin: Vec3, points: number[], radius: number, filter?: QueryFilter): number[] {
  const m = worldOf(w)
  const ids: number[] = []
  b3.b3World_OverlapShape(m.world, origin, points, radius, queryFilter(filter), (s: b3ShapeId) => { ids.push(ownerOf(m, s)); return true })
  return unique(ids)
}

// The bodies whose shapes' bounds overlap the box [minX, minY, minZ, maxX, maxY, maxZ].
export function overlapAABB(w: W, aabb: b3AABB, filter?: QueryFilter): number[] {
  const m = worldOf(w)
  const ids: number[] = []
  b3.b3World_OverlapAABB(m.world, aabb, queryFilter(filter), (s: b3ShapeId) => { ids.push(ownerOf(m, s)); return true })
  return unique(ids)
}

// The character mover: how far along `translation`, 0 to 1, a capsule at `origin` moves before it
// meets something.
export function castMover(w: W, origin: Vec3, mover: b3Capsule, translation: Vec3, filter?: QueryFilter): number {
  const m = worldOf(w)
  return b3.b3World_CastMover(m.world, origin, mover, translation, queryFilter(filter), () => true)
}

// The character mover: the planes of everything a capsule at `origin` touches or is inside, each
// with the body it is of.
export function collideMover(w: W, origin: Vec3, mover: b3Capsule, filter?: QueryFilter): (Plane & { id: number })[] {
  const m = worldOf(w)
  const planes: (Plane & { id: number })[] = []
  const out = b3.createPlaneResult()
  b3.b3World_CollideMover(m.world, origin, mover, queryFilter(filter), (s: b3ShapeId, buf: any) => {
    for (let i = 0, n = b3.getNumPlaneResults(buf); i < n; i++) {
      b3.getPlaneResultAt(out, buf, i)
      planes.push({ id: ownerOf(m, s), normal: v3(out.plane.normal), offset: out.plane.offset, point: v3(out.point) })
    }
    return true
  })
  return planes
}

// The character mover's solver: the move nearest `targetDelta` that the planes allow.
export function solvePlanes(targetDelta: Vec3, planes: CollisionPlane[]): { delta: Vec3; iterationCount: number } {
  const r = b3.b3SolvePlanes(targetDelta, planes)
  return { delta: v3(r.delta), iterationCount: r.iterationCount }
}

// A velocity with the part of it into the planes taken off.
export function clipVector(vector: Vec3, planes: CollisionPlane[]): Vec3 {
  return v3(b3.b3ClipVector(vector, planes))
}

// Every contact a body is in: the other body, and each manifold's normal and points.
export function contacts(w: W, row: Row) {
  const m = worldOf(w)
  const h = heldOf(m, row)
  const buf = b3.createContactsBuffer()
  const c = b3.createContact(), mf = b3.createManifold()
  try {
    b3.getBodyContactData(buf, h.id)
    const out = []
    for (let i = 0, n = b3.getNumContacts(buf); i < n; i++) {
      b3.getContactAt(c, buf, i)
      const a = ownerOf(m, c.shapeIdA), b = ownerOf(m, c.shapeIdB)
      const manifolds = []
      for (let k = 0; k < c.manifoldCount; k++) {
        b3.getManifoldAt(mf, c, k)
        manifolds.push({
          normal: v3(mf.normal), twistImpulse: mf.twistImpulse, frictionImpulse: v3(mf.frictionImpulse), rollingImpulse: v3(mf.rollingImpulse),
          points: mf.points.slice(0, mf.pointCount).map(p => ({ ...p, anchorA: v3(p.anchorA), anchorB: v3(p.anchorB) })),
        })
      }
      out.push({ a, b, with: a === row.id ? b : a, manifolds })
    }
    return out
  } finally {
    b3.destroyContactsBuffer(buf)
  }
}

// A body's mass, centre of mass (its own frame) and rotational inertia.
export function massOf(w: W, row: Row): b3MassData {
  return b3.b3Body_GetMassData(heldOf(worldOf(w), row).id)
}

// The velocity of a point of the world as it rides on a body.
export function pointVelocity(w: W, row: Row, point: Vec3): Vec3 {
  return b3.b3Body_GetWorldPointVelocity([0, 0, 0], heldOf(worldOf(w), row).id, point)
}

// The bounds of a body's shapes, [minX, minY, minZ, maxX, maxY, maxZ].
export function boundsOf(w: W, row: Row): b3AABB {
  return b3.b3Body_ComputeAABB([0, 0, 0, 0, 0, 0], heldOf(worldOf(w), row).id)
}

// How much the world holds and how many of its bodies are awake.
export function counters(w: W) {
  const m = worldOf(w)
  return { ...b3.b3World_GetCounters(m.world), awakeBodyCount: b3.b3World_GetAwakeBodyCount(m.world) }
}
