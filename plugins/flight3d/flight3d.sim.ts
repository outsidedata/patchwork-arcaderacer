// The server half of flight3d: a fixed-wing aeroplane as forces and moments, a linearised
// stability-derivative airframe with a stalling lift polar, integrated semi-implicitly. It holds no
// library and no memory between steps: everything a plane is doing is on its row, so the server and
// a replay fly the identical plane.
//
// A plane is one `flight3d` row. It holds what changes:
//   type                  the name of its entry in `world.flight3d.planes`: which plane it is.
//   pos, rot, vel, spin   where it is (m), its attitude (a quaternion [x, y, z, w], body to world),
//                         its velocity (m/s, world) and its angular velocity (rad/s, body frame).
//   aileron, elevator, rudder   the surfaces' angles (rad), each chasing the stick at its rate.
//   pitch, roll, yaw      the stick, each -1 to 1: +pitch is nose up, +roll is right wing down,
//                         +yaw is nose right (and, on the ground, the steered wheels turn right).
//   throttle              the lever, 0 to 1.
//   throttling            which way the lever is being pushed, -1 to 1: it moves at the airframe's
//                         `throttleRate` (full travel a second) times this.
//   airbrake              0 to 1.
//   brake                 the wheel brakes, 0 to 1.
//   gear                  how far the gear is down, 0 up to 1 locked down.
//   gearDown              the gear lever: true down, false up.
//   press                how far each wheel of its gear is pressed in (m), 0 off the ground: written
//                         each step for the browser half to draw.
//   crashed               true once it has met the ground other than on its wheels; a crashed plane
//                         lies where it hit.
// A rule writes `type` when it makes the plane, and the stick, `throttling`, `airbrake`, `brake` and `gearDown`;
// this plugin writes the rest. How fast it flies, its angle of attack, its sideslip and how stalled it
// is are not on the row: they follow from `vel` and `rot`, and `windAngles` and `aero` hand them to
// whatever shows them.
//
// What never changes is the scene's `world.flight3d`:
//   gravity     m/s², down.
//   air         `density`, kg/m³ at y = 0; `scaleHeight`, m, the air thinning as e^(−y/scaleHeight);
//               `calm`, m/s, the speed below which there is no relative wind to fly on.
//   materials   what an airframe's mass is priced from (`price`): `engineDensity`, N of thrust a kg
//               of engine; `wingDensity`, kg a m² of wing; `structureDrag`, m² of drag area a kg of
//               structure.
//   planes      the planes there are, by name, each `{ airframe, gear, look }`:
//                 airframe  the sheet (`Sheet`): what was bought, with no mass on it — the mass is its
//                           parts'.
//                 gear      its wheels and what else of it may touch the ground (`Gear`, below).
//                 look      how the browser half draws it (`flight3d.plugin.ts`).
//   overspeed   the cap on speed, as a multiple of a sheet's top speed at y = 0 (`topSpeed`).
//   sweep       m: the path a step flies is checked against the ground this often along it.
//   mods        `{ ground: '<a>' }`: the plugin whose mod `plugins/<a>/<a>.flight3d.ts` hands flight3d
//               `ground(w, x, z)`, the height of the ground under a world x, z (`addons/scenemanager`'s
//               mods). With none the plane flies over nothing, never touches down and never crashes.
//   kinds       the kinds whose rows are planes, `['flight3d']` when it gives none: a game whose seat
//               flies its own `player` row lists `player`, and that kind's rule flies it with `step` (or
//               this kind's `tick`), so a page running the scene ahead draws the seat's plane from its
//               copy. The browser half draws every row of these kinds.
//
// THE ENGINE. Thrust is `maxThrust` times the lever, falling with the air's density; a propeller's
// (`propSpeed` > 0) also falls as propSpeed / speed above `propSpeed`, so it is power, not force, that
// runs out (thrust times speed is maxThrust·propSpeed there). The engine puts `engineTorque` (N·m at
// full throttle) back on the airframe against its turn, and its spinning mass, `engineInertia` (kg·m²)
// turning `engineSpin` (rad/s at full throttle, positive clockwise seen from the cockpit), carries an
// angular momentum H along the nose: turning the airframe turns H, and the engine pushes back with
// H × ω. A clockwise engine rolls the plane left under power, drops the nose in a right turn and
// raises it in a left, and yaws it right in a pull: the Camel's whole reputation.
//
// THE GEAR, `{ wheels, brakeGrip, sink, touch, retract, drag }`. Gear with `retract` > 0 retracts: `gear`
// travels toward `gearDown` over `retract` seconds end to end, and is held down while any wheel bears
// weight; fixed gear (`retract` 0) stays down. Only gear locked down (`gear` 1) has wheels: below that the
// plane meets the ground on its `touch` points, and a landing with the gear up is a crash. The gear adds
// `drag` m² of drag area, times how far it is down, straight back. Each wheel is `{ at, radius, spring, damper, roll,
// grip, brake, steer }`: its axle `at` in the body frame. Where the ground comes nearer the axle than
// its radius the wheel is pressed in by the difference, and pushes back along the ground's normal (the
// ground's slope, read off `ground` itself) as a spring, N·m⁻¹, and a damper, N·s·m⁻¹, never pulling.
// That push N buys friction at the tyre: along its rolling direction `roll`·N, and `brakeGrip`·N times
// `brake` more on a wheel with `brake`; across it up to `grip`·N; each growing over the first 0.5 m/s
// of slip so a plane at rest does not chatter. A wheel with `steer` rolls `steer`·yaw radians off the
// nose. The plane crashes, where it is, when a wheel meets the ground faster than `sink` m/s, when a
// wheel is pressed in past its radius, or when any `touch` point (body frame: a wingtip, the prop's
// tip, the tail) is below the ground; and, as it always has, when the path its centre flies in a step
// meets the ground.
//
// FRAMES AND SIGNS. World: x/z is the ground plane, y is up, metres. Body: +X is the right wing, +Y
// is up, −Z is the nose. The aerodynamics are written in the aviation frame, x forward, y right,
// z down, with rates p (roll right), q (nose up), r (nose right), because every stability derivative
// is quoted in it. The mapping between the two, once:
//   aviation forward = −Z_body     aviation right = +X_body     aviation down = −Y_body
//   p = −wz     +wz raises the right wing, so it rolls left
//   q = +wx     +wx swings the nose toward +Y, so it pitches up
//   r = −wy     +wy swings the nose toward −X, so it yaws left
//   α = atan2(−v_body.y, |v_body.z|)   air from below is +α
//   β = atan2( v_body.x, |v_body.z|)   velocity to the right is +β
// The moments, in their aviation signs, as the derivatives are stored:
//   L = qd·S·b·(clDeltaA·δa + clP·p̂)                      roll right positive
//   M = qd·S·c̄·(cm0 + cmAlpha·α + cmQ·q̂ + cmDeltaE·δe)    nose up positive
//   N = qd·S·b·(cnBeta·β + cnR·r̂ + cnDeltaR·δr)            nose right positive
// and back to body torques by the same identities: τx = +M, τy = −N, τz = −L. So +pitch is nose
// up, +roll is right, +yaw is nose right, and every derivative keeps a textbook's sign. The airframe's
// own gyroscopic coupling (ω × Iω) is left out: near-symmetric inertia at modest rates. The engine's is
// not (THE ENGINE): its H lies along −Z_body, so the engine's moment on the airframe is
// (h·wy, −h·wx, engineTorque·throttle) with h = engineInertia·engineSpin·throttle.
//
// Each step, in `tick`: the surfaces slew toward the stick, the lever moves, the forces (world) and
// moments (body) of the air and the engine are worked out (`aero`) and the gear's added (`contact`),
// the angular velocity then the attitude, and the velocity then the position, are stepped —
// semi-implicit, which keeps a circling turn from spiralling out at a fixed step — and the path from
// where the plane was to where it is now is checked against the ground every `sweep` metres, so a
// plane at 300 m/s cannot pass through a ridge between two steps.
import type { Kind, Row, W } from '#engine/engine.ts'
import * as math from '#plugins/math/math.sim.ts'
import { mod } from '#addons/scenemanager/scenemanager.addon.ts'

export type Vec3 = number[]
export type Quat = [x: number, y: number, z: number, w: number]

/** What a designer buys. It carries no mass: the mass is priced from the parts (`price`). */
export type Sheet = {
  structureMass: number // kg of hull; it also casts a drag shadow, so structure is never free
  maxThrust: number // N at full throttle at y = 0
  throttleRate: number // lever travel a second while it is pushed
  wingArea: number // m²
  span: number // m
  incidence: number // rad the wing's zero-lift line is set nose up from the body's −Z (its rigging plus its aerofoil's camber): the angle it lifts on is α plus this
  clAlpha: number; clPostStall: number; alphaStall: number; stallBlend: number
  cd0: number; oswald: number; cdFlatPlate: number; brakeCd: number
  cyBeta: number
  clDeltaA: number; clP: number
  cm0: number; cmAlpha: number; cmQ: number; cmDeltaE: number
  cnBeta: number; cnR: number; cnDeltaR: number
  maxAileron: number; maxElevator: number; maxRudder: number // rad
  aileronRate: number; elevatorRate: number; rudderRate: number // rad/s
  rGyrRoll: number; rGyrPitch: number; rGyrYaw: number // m, I = m·r²
  propSpeed: number // m/s above which a propeller's thrust falls as propSpeed / speed; 0 for a jet
  engineTorque: number // N·m the engine puts back on the airframe at full throttle
  engineInertia: number; engineSpin: number // kg·m² of turning engine, rad/s at full throttle (+ clockwise from the cockpit)
}
/** A sheet priced: the two numbers the integrator reads, both derived. */
export type Airframe = Sheet & { mass: number; structureDragArea: number }
export type Materials = { engineDensity: number; wingDensity: number; structureDrag: number }
export type Air = { density: number; scaleHeight: number; calm: number }
export type Wheel = {
  at: Vec3 // the axle, body frame
  radius: number; spring: number; damper: number // m, N/m, N·s/m
  roll: number; grip: number // friction coefficients along and across the tyre
  brake: boolean; steer: number // braked; radians it turns at full yaw
}
export type Gear = { wheels: Wheel[]; brakeGrip: number; sink: number; touch: Vec3[]; retract: number; drag: number }
/** How the browser half draws a plane: its loader model, its propeller's rad/s at full throttle on the
 *  page's clock (+ clockwise from the cockpit), and the radians its airbrake nodes turn at full brake. */
export type Look = { model: string; spin: number; airbrake: number; gear: number }
/** One plane of the catalogue. */
export type Model = { airframe: Sheet; gear: Gear; look: Look }
export type Flight = {
  gravity: number
  air: Air
  materials: Materials
  planes: Record<string, Model>
  overspeed: number
  sweep: number
  mods?: Record<string, string>
  kinds?: string[]
}
/** The stick as the integrator takes it. */
export type Stick = { pitch: number; roll: number; yaw: number; airbrake: number }
/** What a `flight3d` row carries. */
export type Plane = {
  type: string
  pos: Vec3; rot: Quat; vel: Vec3; spin: Vec3
  aileron: number; elevator: number; rudder: number
  pitch: number; roll: number; yaw: number
  throttle: number; throttling: number; airbrake: number; brake: number
  gear: number; gearDown: boolean
  press: number[]
  crashed: boolean
}
export type Ground = (w: W, x: number, z: number) => number

const clamp = (x: number, lo: number, hi: number) => (x < lo ? lo : x > hi ? hi : x)
const toward = (now: number, want: number, step: number) =>
  now < want ? Math.min(now + step, want) : Math.max(now - step, want)
function smootherstep(edge0: number, edge1: number, x: number): number {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1)
  return t * t * t * (t * (t * 6 - 15) + 10)
}

// ---------------------------------------------------------------- the ledger

export const massOf = (s: Sheet, m: Materials) => s.structureMass + s.maxThrust / m.engineDensity + s.wingArea * m.wingDensity
export const dragShadowOf = (s: Sheet, m: Materials) => s.structureMass * m.structureDrag
/** The one way to make a flyable airframe: its weight is the sum of its parts, every time. */
export const price = (s: Sheet, m: Materials): Airframe => ({ ...s, mass: massOf(s, m), structureDragArea: dragShadowOf(s, m) })
/** Thrust at a lever, an air density (of `rho0` at y = 0) and a speed: a propeller's falls as
 *  propSpeed / speed above `propSpeed`. */
export function thrustOf(t: Sheet, throttle: number, rho: number, rho0: number, speed: number) {
  const fade = t.propSpeed > 0 && speed > t.propSpeed ? t.propSpeed / speed : 1
  return t.maxThrust * clamp(throttle, 0, 1) * (rho / rho0) * fade
}
/** Top speed in closed form, where full thrust meets parasite drag at density `rho` (as at y = 0): for
 *  a jet thrust is constant there, √(T / k); for a propeller past `propSpeed` it is power, ∛(T·propSpeed / k). */
export function topSpeed(t: Airframe, rho: number) {
  const k = 0.5 * rho * (t.wingArea * t.cd0 + t.structureDragArea)
  const flat = Math.sqrt(t.maxThrust / k)
  return t.propSpeed > 0 && flat > t.propSpeed ? math.cbrt((t.maxThrust * t.propSpeed) / k) : flat
}
/** The speed below which the wing cannot hold the plane up in level flight at density `rho`. */
export const stallSpeed = (t: Airframe, gravity: number, rho: number) =>
  Math.sqrt((2 * t.mass * gravity) / (rho * t.wingArea * t.clAlpha * t.alphaStall))
/** The air's density at height y. */
export const densityAt = (air: Air, y: number) => air.density * math.exp(-y / air.scaleHeight)
/** Plane `type` of this world's catalogue, refused naming the planes there are. */
export function modelOf(f: Flight, type: string): Model {
  const m = f.planes[type]
  if (!m) throw new Error(`world.flight3d.planes has no ${type}: its planes are ${Object.keys(f.planes).join(', ')}`)
  return m
}
/** Plane `type`'s airframe, priced. */
export const airframeOf = (f: Flight, type: string) => price(modelOf(f, type).airframe, f.materials)

// ---------------------------------------------------------------- quaternions (body to world)

/** v turned by q. */
export function rotate(q: Quat, v: Vec3): Vec3 {
  const [qx, qy, qz, qw] = q
  const tx = 2 * (qy * v[2] - qz * v[1]), ty = 2 * (qz * v[0] - qx * v[2]), tz = 2 * (qx * v[1] - qy * v[0])
  return [v[0] + qw * tx + qy * tz - qz * ty, v[1] + qw * ty + qz * tx - qx * tz, v[2] + qw * tz + qx * ty - qy * tx]
}
/** A world vector in the body frame. */
export const unrotate = (q: Quat, v: Vec3) => rotate([-q[0], -q[1], -q[2], q[3]], v)
/** q advanced by body rates over dt, renormalised. */
function spinBy(q: Quat, [wx, wy, wz]: Vec3, dt: number): Quat {
  const [x, y, z, w] = q, h = dt * 0.5
  const nx = x + h * (w * wx + y * wz - z * wy)
  const ny = y + h * (w * wy + z * wx - x * wz)
  const nz = z + h * (w * wz + x * wy - y * wx)
  const nw = w - h * (x * wx + y * wy + z * wz)
  const n = math.hypot(nx, ny, nz, nw) || 1
  return [nx / n, ny / n, nz / n, nw / n]
}
/** Wings level with the nose `heading` radians clockwise from −Z seen from above: a turn about up. */
export const fromHeading = (heading: number): Quat => [0, math.sin(-heading / 2), 0, math.cos(-heading / 2)]
/** The nose on `heading` and `pitch` radians up from level, wings level: the heading's turn, then the
 *  pitch about the wing. */
export function fromAttitude(heading: number, pitch: number): Quat {
  const [, y, , w] = fromHeading(heading)
  const s = math.sin(pitch / 2), c = math.cos(pitch / 2)
  // (0, y, 0, w) · (s, 0, 0, c)
  return [w * s, y * c, -y * s, w * c]
}
/** The nose's direction for a heading, as `fromHeading` turns it. */
export const noseOf = (heading: number): Vec3 => [math.sin(heading), 0, -math.cos(heading)]

// ---------------------------------------------------------------- the flight picture

/** Speed, angle of attack and sideslip, off the plane's own state. The one place α and β are made. */
export function windAngles(p: Pick<Plane, 'vel' | 'rot'>, air: Air): { aoa: number; slip: number; speed: number } {
  const speed = math.hypot(p.vel[0], p.vel[1], p.vel[2])
  if (speed < air.calm) return { aoa: 0, slip: 0, speed }
  const b = unrotate(p.rot, p.vel)
  const fwd = Math.abs(b[2]) // keeps both angles sane flying backwards
  return { aoa: math.atan2(-b[1], fwd), slip: math.atan2(b[0], fwd), speed }
}

export type Aero = {
  aoa: number; slip: number; speed: number
  qd: number; cl: number; cd: number
  lift: number; drag: number; side: number; thrust: number; weight: number
  stall: number // 0 attached, 1 fully separated
  surfaces: { aileron: number; elevator: number; rudder: number }
  force: Vec3 // world, N
  torque: Vec3 // body, N·m
}

/** The whole flight picture for one step: the surfaces slewed toward the stick, then the forces and
 *  moments that follow. Pure, so a HUD, a panel and a test read it without stepping anything. */
export function aero(p: Plane, stick: Stick, f: Flight, t: Airframe, dt: number): Aero {
  const aileron = toward(p.aileron, clamp(stick.roll, -1, 1) * t.maxAileron, t.aileronRate * dt)
  const elevator = toward(p.elevator, clamp(stick.pitch, -1, 1) * t.maxElevator, t.elevatorRate * dt)
  const rudder = toward(p.rudder, clamp(stick.yaw, -1, 1) * t.maxRudder, t.rudderRate * dt)
  const surfaces = { aileron, elevator, rudder }
  const q = p.rot
  const rho = densityAt(f.air, p.pos[1])
  const S = t.wingArea, b = t.span, chord = S / b, aspect = (b * b) / S
  const weight = t.mass * f.gravity
  const { aoa, slip, speed } = windAngles(p, f.air)
  // The engine breathes: thrust falls with the air, so a plane runs out of climb before it runs out
  // of wing; and a propeller's with speed.
  const thr = clamp(p.throttle, 0, 1)
  const thrust = thrustOf(t, thr, rho, f.air.density, speed)
  const fwd = rotate(q, [0, 0, -1]), up = rotate(q, [0, 1, 0]), right = rotate(q, [1, 0, 0])
  const force = [thrust * fwd[0], thrust * fwd[1] - weight, thrust * fwd[2]]
  // The engine's moment on the airframe: its torque against its turn, and its spinning mass's H × ω.
  const h = t.engineInertia * t.engineSpin * thr
  const engine = [h * p.spin[1], -h * p.spin[0], t.engineTorque * thr]
  if (speed < f.air.calm) {
    return { aoa, slip, speed, qd: 0, cl: 0, cd: 0, lift: 0, drag: 0, side: 0, thrust, weight, stall: 0, surfaces, force, torque: engine }
  }
  const qd = 0.5 * rho * speed * speed
  // The lift polar, on the angle the wing meets the air at, α plus its incidence: linear until the
  // flow lets go, then a flat plate. It keys on that angle's size, so it stalls the same upside down.
  const wing = aoa + t.incidence
  const stall = smootherstep(t.alphaStall - t.stallBlend, t.alphaStall + t.stallBlend, Math.abs(wing))
  const cl = (1 - stall) * (t.clAlpha * wing) + stall * (t.clPostStall * math.sin(2 * wing))
  const sinA = math.sin(wing)
  const cd = t.cd0 + (cl * cl) / (Math.PI * aspect * t.oswald) + stall * t.cdFlatPlate * sinA * sinA + t.brakeCd * clamp(stick.airbrake, 0, 1)
  const lift = qd * S * cl
  const drag = qd * S * cd + qd * t.structureDragArea
  const side = qd * S * t.cyBeta * slip
  // Lift along the body's up with the velocity's part taken out, side force likewise along its right,
  // drag straight back: all three square to the velocity.
  const vh = [p.vel[0] / speed, p.vel[1] / speed, p.vel[2] / speed]
  const perp = (axis: Vec3): Vec3 => {
    const d = axis[0] * vh[0] + axis[1] * vh[1] + axis[2] * vh[2]
    const o = [axis[0] - vh[0] * d, axis[1] - vh[1] * d, axis[2] - vh[2] * d]
    const n = math.hypot(o[0], o[1], o[2])
    return n < 1e-6 ? [0, 0, 0] : [o[0] / n, o[1] / n, o[2] / n]
  }
  const liftDir = perp(up), sideDir = perp(right)
  for (let i = 0; i < 3; i++) force[i] += liftDir[i] * lift - vh[i] * drag + sideDir[i] * side
  // The rates in aviation signs, over twice the speed.
  const twoV = 2 * speed
  const pHat = (-p.spin[2] * b) / twoV, qHat = (p.spin[0] * chord) / twoV, rHat = (-p.spin[1] * b) / twoV
  const L = qd * S * b * (t.clDeltaA * aileron + t.clP * pHat)
  const M = qd * S * chord * (t.cm0 + t.cmAlpha * aoa + t.cmQ * qHat + t.cmDeltaE * elevator)
  const N = qd * S * b * (t.cnBeta * slip + t.cnR * rHat + t.cnDeltaR * rudder)
  return { aoa, slip, speed, qd, cl, cd, lift, drag, side, thrust, weight, stall, surfaces, force, torque: [M + engine[0], -N + engine[1], -L + engine[2]] }
}

/** Where the path from `a` to `b` first meets the ground, checked every `sweep` metres along it and
 *  at its end, or undefined when it stays above. */
export function impact(ground: (x: number, z: number) => number, a: Vec3, b: Vec3, sweep: number): Vec3 | undefined {
  const n = Math.max(1, Math.ceil(math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]) / sweep))
  for (let i = 1; i <= n; i++) {
    const k = i / n
    const x = a[0] + (b[0] - a[0]) * k, y = a[1] + (b[1] - a[1]) * k, z = a[2] + (b[2] - a[2]) * k
    const h = ground(x, z)
    if (y <= h) return [x, h, z]
  }
  return undefined
}

const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
const scale = (a: Vec3, k: number): Vec3 => [a[0] * k, a[1] * k, a[2] * k]
const unit = (a: Vec3): Vec3 => scale(a, 1 / (math.hypot(a[0], a[1], a[2]) || 1))
// How much friction a slip buys: all of it past 0.5 m/s, a share of it below, so a wheel at rest is still.
const slipped = (v: number) => clamp(v / 0.5, -1, 1)

/** The ground's normal under x, z: its slope read off `ground` itself, 0.5 m either side. */
export function normalOf(ground: (x: number, z: number) => number, x: number, z: number): Vec3 {
  const e = 0.5
  return unit([-(ground(x + e, z) - ground(x - e, z)) / (2 * e), 1, -(ground(x, z + e) - ground(x, z - e)) / (2 * e)])
}

export type Contact = { force: Vec3; torque: Vec3; press: number[]; crash: boolean }

/** What the ground does to a plane on its gear this step: the force (world) and moment (body) of every
 *  wheel pressed into it, how far each is pressed, and whether it has crashed — a wheel met faster than
 *  `sink`, a wheel pressed past its radius, or a `touch` point under the ground. Pure. */
export function contact(p: Plane, gear: Gear, ground: (x: number, z: number) => number): Contact {
  let force: Vec3 = [0, 0, 0], torque: Vec3 = [0, 0, 0]
  let crash = false
  const omega = rotate(p.rot, p.spin)
  const press = gear.wheels.map(w => {
    // Gear not locked down has no wheels under it: the plane meets the ground on its `touch` points.
    if (p.gear < 1) return 0
    const r = rotate(p.rot, w.at)
    const axle = add(p.pos, r)
    const n = normalOf(ground, axle[0], axle[2])
    const height = (axle[1] - ground(axle[0], axle[2])) * n[1] // the axle's distance from the ground along its normal
    const c = w.radius - height
    if (c <= 0) return 0
    if (c > w.radius) crash = true
    const at = sub(axle, scale(n, height)) // where the tyre meets the ground
    const arm = sub(at, p.pos)
    const v = add(p.vel, cross(omega, arm))
    const vn = dot(v, n)
    if (vn < -gear.sink) crash = true
    const N = Math.max(0, w.spring * c - w.damper * vn)
    // The tyre's rolling direction, turned by its steering, laid in the ground's plane.
    const d = w.steer * clamp(p.yaw, -1, 1)
    const nose = rotate(p.rot, [math.sin(d), 0, -math.cos(d)])
    const along = unit(sub(nose, scale(n, dot(nose, n))))
    const across = cross(along, n)
    const mu = w.roll + (w.brake ? gear.brakeGrip * clamp(p.brake, 0, 1) : 0)
    const F = add(scale(n, N), add(scale(along, -mu * N * slipped(dot(v, along))), scale(across, -w.grip * N * slipped(dot(v, across)))))
    force = add(force, F)
    torque = add(torque, unrotate(p.rot, cross(arm, F)))
    return c
  })
  for (const t of gear.touch) {
    const at = add(p.pos, rotate(p.rot, t))
    if (at[1] < ground(at[0], at[2])) crash = true
  }
  return { force, torque, press, crash }
}

function crashed(p: Plane) {
  p.vel = [0, 0, 0]
  p.spin = [0, 0, 0]
  p.throttle = 0
  p.throttling = 0
  p.airbrake = 0
  p.crashed = true
}

/** One step of a plane, in place, over `ground` (undefined: nothing to touch or hit). */
export function step(p: Plane, f: Flight, dt: number, ground?: (x: number, z: number) => number): Aero {
  const plane = modelOf(f, p.type)
  const t = price(plane.airframe, f.materials)
  const a = aero(p, p, f, t, dt)
  if (p.crashed) return a
  const g = ground && contact(p, plane.gear, ground)
  if (g?.crash) {
    crashed(p)
    return a
  }
  p.press = g ? g.press : plane.gear.wheels.map(() => 0)
  // The gear's own drag, straight back, as far as it is down.
  const gearDrag = a.qd * plane.gear.drag * p.gear
  const along = a.speed > 0 ? scale(p.vel, -gearDrag / a.speed) : [0, 0, 0]
  const force = add(g ? add(a.force, g.force) : a.force, along)
  const torque = g ? add(a.torque, g.torque) : a.torque
  const m = t.mass
  const Ixx = m * t.rGyrPitch * t.rGyrPitch // body X is the pitch axis
  const Iyy = m * t.rGyrYaw * t.rGyrYaw // body Y is the yaw axis
  const Izz = m * t.rGyrRoll * t.rGyrRoll // body Z is the roll axis
  p.spin = [p.spin[0] + (torque[0] / Ixx) * dt, p.spin[1] + (torque[1] / Iyy) * dt, p.spin[2] + (torque[2] / Izz) * dt]
  p.rot = spinBy(p.rot, p.spin, dt)
  const vel = [p.vel[0] + (force[0] / m) * dt, p.vel[1] + (force[1] / m) * dt, p.vel[2] + (force[2] / m) * dt]
  // A plane dies to the ground, never to the integrator: speed is capped a little over the sheet's
  // own top speed, the direction untouched, so a dive rides the cap instead of chattering on it.
  const cap = f.overspeed * topSpeed(t, f.air.density), size = math.hypot(vel[0], vel[1], vel[2])
  if (size > cap) for (let i = 0; i < 3; i++) vel[i] *= cap / size
  p.vel = vel
  p.aileron = a.surfaces.aileron
  p.elevator = a.surfaces.elevator
  p.rudder = a.surfaces.rudder
  p.throttle = clamp(p.throttle + clamp(p.throttling, -1, 1) * t.throttleRate * dt, 0, 1)
  // Retractable gear travels toward the lever, held down while any wheel bears weight.
  if (plane.gear.retract > 0) p.gear = toward(p.gear, p.gearDown || p.press.some(c => c > 0) ? 1 : 0, dt / plane.gear.retract)
  const was = p.pos, now = [was[0] + vel[0] * dt, was[1] + vel[1] * dt, was[2] + vel[2] * dt]
  const hit = ground && impact(ground, was, now, f.sweep)
  if (hit) {
    p.pos = hit
    crashed(p)
  } else p.pos = now
  return a
}

/** This scene's ground, off its `ground` mod, as a height under x, z; undefined when it names none. */
export function groundOf(w: W): ((x: number, z: number) => number) | undefined {
  const g = mod<Ground>(w.world, 'flight3d', 'ground')
  return g && ((x, z) => g(w, x, z))
}

export const flight3d: Kind = {
  tick(me: Row, dt, w) {
    step(me.data as Plane, w.world.flight3d as Flight, dt, groundOf(w))
  },
}
