// drive: arcaderacer's handling, which every racing kind's rule runs on its own row each step, the
// seat's `car` and the CPU's `rival` alike, so the two drive by one set of rules. Its browser half,
// `drive.plugin.ts`, draws every row of those kinds.
//
// `drive(me, dt, w)` moves the row a step from its controls, on the circuit (`track`), and writes
// that row alone: the others it reads to keep clear of. A row of a racing kind carries (its prefab):
//   steer, throttle, brake, handbrake   its controls: steer −1 (left) to 1 (right), the rest 0 or 1.
//   pos [x, y, z], yaw, pitch, roll     where it stands, its heading, nose up and right side down.
//   vel [x, z]                          its velocity across the ground, m/s.
//   spin                                its rate of turn, rad/s, positive to the left.
//   wheel                               the steer it has wound on, −1 to 1, at `steerRate` a second.
//   drift                               0 gripping, or −1 sliding round a left turn, 1 a right.
//   slip                                the angle from its course to its heading, rad, while drifting.
//   slide                               the seconds the drift has lasted.
//   clean                               the drift has touched no wall or car.
//   boost                               the seconds of boost left.
//   held                                the seconds the brake has been held, 0 let go.
//   scrape                              the seconds since it last hit a wall or a car, counting up.
//   seg                                 the circuit's sample it was nearest, −1 until it is placed.
//   s, dist, far                        where it is along the circuit, and its progress (`track`).
//   cam                                 the heading the chase camera looks along, swung toward the
//                                       car's course at `camRate`, so a slide shows the car's side.
//   speed                               how fast it goes, m/s, for whatever reads it.
//   lap, lapAt, last, best, split, splitAt, done   its race (`timing`): the laps it has done, the
//                                       race clock its lap began at, its last and best laps (−1 for
//                                       none yet), the checkpoints it has passed and the clock at the
//                                       last, and the clock it finished at (−1 racing).
// Its kind's definition holds `drive`, every number below, in metres, seconds and radians:
//   top, accel, brake, reverse, drag, roll   the engine and the road: `accel` m/s² at a standstill,
//                    falling with the square of the speed to 0 at `top` m/s; `brake` m/s² slowing; `reverse` the most backwards;
//                    `drag` × speed² and `roll` m/s² slowing it.
//   base, lock, fade the wheelbase, the most the front wheels turn (rad) at a crawl, and the speed at
//                    which that has halved.
//   grip, cling      gripping, how fast sideways speed dies (1/s), and the most sideways pull, m/s².
//   turnRate         how fast the rate of turn follows the wheels, 1/s.
//   steerRate        how fast the wheel winds toward the stick, a second for the whole way.
//   tap              a brake press shorter than this, with the wheel turned, starts a drift; the
//                    handbrake held does the same at any length.
//   entry            the least speed a drift starts at, m/s, and below `entry` × `stall` it ends.
//   stall            see `entry`.
// Drifting, the slip is what the driver feeds it and the tyres take back. It closes on a target
// exactly over each step, slip = target + (slip − target)·e^(−rate·dt): the target is `angle` times
// how far the wheel is held into the drift, `lift` of that off the throttle, at least `hand` of
// `angle` while the handbrake is held, and 0 with the wheel straight or against it. It grows toward a
// bigger target at `build` a second and is pulled down toward a smaller one at `restore` a second,
// `counter` more for each unit of countersteer: grip always pulls against the slide, so a drift
// nobody feeds falls out of itself, and countersteer catches it quickly. The course turns into the
// drift at `carve` rad/s times the slip over `angle`, so the slide is the turn: more slip carves
// tighter, and as the slip dies the turn eases out into the grip that takes over from it, the rate
// of turn carried across.
//   carve            see above, rad/s at a slip of `angle`.
//   angle            the most slip, rad: the wheel full into the drift on the throttle.
//   lift             the share of the slip held off the throttle.
//   hand             the share of `angle` the handbrake holds the slip at, at least.
//   build, restore   the rates, 1/s, the slip grows and dies at.
//   counter          the rate added to `restore` for each unit of countersteer, 1/s.
//   scrub            m/s² of speed lost per radian of slip.
//   kick             the slip a drift starts with, rad, the tail stepping out.
//   settle           a drift ends once it has lasted this long, the slip is under `straighten` and
//                    the handbrake is let go.
//   straighten       see `settle`.
//   reward           each second of a clean drift is this many seconds of boost, at most `most`.
//   most             see `reward`.
//   push, pushTop    boost adds `push` m/s² and lifts the top speed by `pushTop` m/s.
//   wall             a hit takes this much of the speed it struck the wall at off the speed along it:
//                    a glancing touch costs little, a square hit the most.
//   glance           each step it is pressed into a wall, this much of the angle between its nose and
//                    the wall's line is taken off, so it swings to run along the wall.
//   radius, bump     two racers are kept 2 × `radius` apart, and each takes `bump` of the speed it
//                    closes at.
//   camRate          how fast `cam` swings toward the course, 1/s.
//   camLead          how much of the slip the camera keeps: 0 looks down the course, 1 down the nose.
//
// `run(me, dt, w, race)` is a racer's step in the race: `drive` while the race lets it (`racing`),
// then `timing`, its laps and checkpoints against the race's clock and its definition's `laps`.
// `control(me, name, v)` writes one of a row's controls (`CONTROLS`), kept to its range; the acts of
// the seat's `car` and the rival's own driving call it. `place(me, w, at)` puts a row on
// the circuit at rest. `racers(w)` are the rows whose kinds' definitions have a `drive`.
//
// `pilot(from, me, A, place)` is a CPU driver: the four controls a racer `me` would drive with now, on
// grid place `place`, read off the truth a rule runs in or the rows a page holds (`from`), so the CPU's
// `rival` drives by it on the server and a page's playtester drives the seat's car by it in the
// browser. `A` is how it drives, in metres, seconds and radians (the `rival` definition's `ai`):
//   skill        a list, one per grid place round again: how close to the limit it takes the corners
//                and how much of its top speed it uses.
//   lanes        a list, one per grid place round again: metres right of the racing line it keeps.
//   look, lookTime  it steers at the road `look` + `lookTime` × its speed ahead.
//   line         how far toward the inside of the bend ahead the racing line runs, metres per 1/m of
//                curvature, at most `edge` metres in from the road's edge.
//   edge         see `line`.
//   steer        how hard it turns the wheel for each radian it points off its line.
//   scan         how far ahead it looks for a bend to slow for.
//   brake        the m/s² it reckons on slowing at when planning.
//   room         the share of what the tyres or the drift could carry round a bend that it plans on,
//                so it has room to correct.
//   margin       how far over the speed it plans it lets itself go before it brakes.
//   drift        a bend sharper than this (1/m) it drifts through when it comes at it faster than
//                `eager` of what its tyres would grip, as long as the bend is within `entry` metres.
//   eager        see `drift`: under 1, it throws a drift at a bend it could just about grip.
//   entry        see `drift`.
//   hold         drifting, it reads the bend it turns for `hold` seconds ahead at its speed: the slip
//                that turns its course takes time to grow.
//   carve        drifting, the rate it turns its course back onto its line, 1/s for each radian off.
import type { Row, W } from '#engine/engine.ts'
import type { Wire } from '#engine/browser.ts'
import { def } from '#plugins/loader/loader.sim.ts'
import * as math from '#plugins/math/math.sim.ts'
import { angle, locate, progress, sample, trackOf } from '../track/track.sim.ts'

export type Spec = {
  top: number; accel: number; brake: number; reverse: number; drag: number; roll: number
  base: number; lock: number; fade: number; grip: number; cling: number; turnRate: number; steerRate: number
  tap: number; entry: number; stall: number; carve: number; angle: number; lift: number; hand: number
  build: number; restore: number; counter: number; scrub: number; kick: number; settle: number; straighten: number; reward: number; most: number
  push: number; pushTop: number; wall: number; glance: number; radius: number; bump: number; camRate: number; camLead: number
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))
const toward = (v: number, to: number, by: number) => (v < to ? Math.min(to, v + by) : Math.max(to, v - by))

// The kinds that race.
export const RACING = ['car', 'rival']
export const racers = (w: W): Row[] => RACING.flatMap(kind => w.all(kind))

// The controls a row is driven by, and the range each is kept to.
export const CONTROLS = { steer: [-1, 1], throttle: [0, 1], brake: [0, 1], handbrake: [0, 1] } as const
export type Control = keyof typeof CONTROLS

// One control of a row set to `v`, kept to its range; anything but a number is 0.
export function control(me: Row, name: Control, v: unknown) {
  const [lo, hi] = CONTROLS[name]
  me.data[name] = typeof v === 'number' && Number.isFinite(v) ? clamp(v, lo, hi) : 0
}

// The row at rest on the circuit at `at`, heading `yaw`.
export function place(me: Row, w: W, at: { pos: [number, number, number]; yaw: number }) {
  const t = trackOf(w)
  const where = locate(t, at.pos[0], at.pos[2], -1)
  me.data.pos = [at.pos[0], where.height, at.pos[2]]
  me.data.yaw = at.yaw
  me.data.cam = at.yaw
  me.data.pitch = math.atan(where.grade)
  me.data.roll = math.atan(where.slope)
  me.data.vel = [0, 0]
  me.data.seg = where.i
  me.data.s = where.s
  me.data.dist = where.s - t.length
  me.data.far = me.data.dist
}

export function drive(me: Row, dt: number, w: W): { laps: number; splits: number } {
  const D: Spec = def(w, me.kind).drive
  const t = trackOf(w)
  const d = me.data
  let yaw: number = d.yaw
  let [vx, vz]: number[] = d.vel
  // the body's own frame: forward and right
  const fwd = () => [math.sin(yaw), math.cos(yaw)]
  const right = () => [-math.cos(yaw), math.sin(yaw)]
  let [fx, fz] = fwd(), [rx, rz] = right()
  let u = vx * fx + vz * fz
  let lat = vx * rx + vz * rz

  d.wheel = toward(d.wheel, d.steer, dt / D.steerRate)
  const pressed = d.brake > 0 && d.held === 0
  d.held = d.brake > 0 ? d.held + dt : 0
  const turning = Math.abs(d.wheel) > 0.3

  // a drift starts: a tap of the brake or the handbrake, the wheel turned, fast enough
  if (!d.drift && turning && u > D.entry && (pressed || d.handbrake > 0)) {
    d.drift = d.wheel < 0 ? -1 : 1
    d.slide = 0
    d.clean = true
    d.slip = d.drift * Math.max(D.kick, Math.abs(math.atan2(lat, Math.max(u, 1))))
  }

  const boosting = d.boost > 0
  const top = D.top + (boosting ? D.pushTop : 0)
  // along the way it points or the way it goes: engine, brake, drag
  let a = 0
  if (d.throttle > 0 && u < top) a += d.throttle * D.accel * (1 - math.pow(Math.max(0, u) / top, 2))
  if (boosting) a += D.push
  // a tap that starts a drift is not a brake: only a held brake slows
  if (d.brake > 0 && !(d.drift && d.held < D.tap)) a += u > 0.5 ? -D.brake : u > -D.reverse ? -D.accel * 0.5 : 0
  a -= D.drag * u * Math.abs(u) + D.roll * Math.sign(u)

  if (d.drift) {
    // the slip closes on what the wheel, the throttle and the handbrake feed it, grip pulling it
    // back; the course turns by the slip, and the nose leads the course by it
    const into = d.wheel * d.drift
    const fed = Math.max(0, into) * (d.throttle > 0 ? 1 : D.lift)
    const want = d.drift * D.angle * Math.max(fed, d.handbrake > 0 ? D.hand : 0)
    const growing = Math.abs(want) > Math.abs(d.slip)
    const rate = growing ? D.build : D.restore + D.counter * Math.max(0, -into)
    d.slip = want + (d.slip - want) * math.exp(-rate * dt)
    const speed = Math.max(0, math.hypot(vx, vz) + a * dt - D.scrub * Math.abs(d.slip) * dt)
    const turn = (D.carve * d.slip) / D.angle
    const course = math.atan2(vx, vz) - turn * dt
    yaw = course - d.slip
    vx = math.sin(course) * speed
    vz = math.cos(course) * speed
    // the rate of turn the grip takes over with, so leaving the slide does not jerk the nose
    d.spin = -turn
    d.slide += dt
    const settled = d.slide > D.settle && Math.abs(d.slip) < D.straighten && !d.handbrake
    if (settled || speed < D.entry * D.stall) {
      if (d.clean && d.slide >= D.settle) d.boost = Math.min(D.most, d.boost + d.slide * D.reward)
      d.drift = 0
      d.slip = 0
    }
  } else {
    // gripping: the wheels set the rate of turn, as far as the tyres can pull
    const steerAngle = d.wheel * D.lock / (1 + Math.abs(u) / D.fade)
    let want = (u * math.tan(-steerAngle)) / D.base
    const most = D.cling / Math.max(Math.abs(u), 1)
    want = clamp(want, -most, most)
    d.spin += (want - d.spin) * (1 - math.exp(-D.turnRate * dt))
    yaw += d.spin * dt
    u += a * dt
    lat *= math.exp(-D.grip * dt)
    ;[fx, fz] = fwd()
    ;[rx, rz] = right()
    vx = fx * u + rx * lat
    vz = fz * u + rz * lat
  }
  d.boost = Math.max(0, d.boost - dt)

  // move, then the walls and the other racers
  let x = d.pos[0] + vx * dt, z = d.pos[2] + vz * dt
  let where = locate(t, x, z, d.seg)
  const edge = t.walls - D.radius * 0.5
  if (Math.abs(where.side) > edge) {
    const out = Math.sign(where.side)
    const over = Math.abs(where.side) - edge
    const nx = -math.cos(where.yaw) * out, nz = math.sin(where.yaw) * out
    x -= nx * over
    z -= nz * over
    const into = vx * nx + vz * nz
    if (into > 0) {
      vx -= nx * into
      vz -= nz * into
      // the wall rubs off `wall` of the speed it was hit at, from the speed along it
      const along = math.hypot(vx, vz)
      const keep = along > 1e-9 ? Math.max(0, along - D.wall * into) / along : 0
      vx *= keep
      vz *= keep
      // and the nose swings toward the line of the wall, the way it was going along it
      const line = math.cos(angle(where.yaw - yaw)) >= 0 ? where.yaw : where.yaw + Math.PI
      yaw += angle(line - yaw) * D.glance
      d.spin = 0
    }
    hit(d)
    where = locate(t, x, z, where.i)
  }
  for (const o of racers(w)) {
    if (o === me || o.data.seg < 0) continue
    const dx = x - o.data.pos[0], dz = z - o.data.pos[2]
    const gap = math.hypot(dx, dz)
    if (gap >= 2 * D.radius || gap < 1e-6) continue
    const nx = dx / gap, nz = dz / gap
    x += nx * (2 * D.radius - gap) * 0.5
    z += nz * (2 * D.radius - gap) * 0.5
    const closing = (vx - o.data.vel[0]) * nx + (vz - o.data.vel[1]) * nz
    if (closing < 0) {
      vx -= nx * closing * D.bump
      vz -= nz * closing * D.bump
    }
    hit(d)
    where = locate(t, x, z, where.i)
  }

  const moved = progress(t, where, d.s, d.dist, d.far)
  d.pos = [x, where.height, z]
  d.vel = [vx, vz]
  d.yaw = angle(yaw)
  d.pitch = math.atan(where.grade * math.cos(angle(yaw - where.yaw)))
  d.roll = math.atan(where.slope * math.cos(angle(yaw - where.yaw)))
  d.seg = where.i
  d.s = where.s
  d.dist = moved.dist
  d.far = moved.far
  d.speed = math.hypot(vx, vz)
  d.scrape += dt
  // the camera's heading: down the course, keeping `camLead` of the slip
  const course = d.speed > 1 ? math.atan2(vx, vz) : d.yaw
  const look = course + angle(d.yaw - course) * D.camLead
  d.cam = angle(d.cam + angle(look - d.cam) * (1 - math.exp(-D.camRate * dt)))
  return { laps: moved.laps, splits: moved.splits }
}

// How a CPU drives: the `rival` definition's `ai` (the header, `pilot`).
export type Ai = {
  skill: number[]; lanes: number[]; look: number; lookTime: number; line: number; edge: number; steer: number
  scan: number; brake: number; room: number; margin: number; drift: number; eager: number; entry: number; hold: number; carve: number
}

// The controls the racer `me` on grid place `place` drives with now, by `A`.
export function pilot(from: W | Wire, me: Row, A: Ai, place: number): Record<Control, number> {
  const D: Spec = def(from, me.kind).drive
  const t = trackOf(from)
  const d = me.data
  const skill = A.skill[place % A.skill.length]
  const at = locate(t, d.pos[0], d.pos[2], d.seg)
  const speed = d.speed
  // the racing line: toward the inside of the bend beyond where it aims
  const reach = A.look + A.lookTime * speed
  const ahead = sample(t, at.s + reach)
  const bend = sample(t, at.s + reach * 1.5).curve
  const most = t.width / 2 - A.edge
  const lane = clamp(-bend * A.line + A.lanes[place % A.lanes.length], -most, most)
  const tx = ahead.x - math.cos(ahead.yaw) * lane, tz = ahead.z + math.sin(ahead.yaw) * lane
  const want = math.atan2(tx - d.pos[0], tz - d.pos[2])
  // the speed it can carry: no faster than it can slow to each bend ahead in time
  let allowed = D.top * skill
  let tight = 0
  for (let k = 0; k <= A.scan; k += t.step) {
    const curve = sample(t, at.s + k).curve
    const sharp = Math.abs(curve)
    if (sharp < 1e-4) continue
    let corner = Math.sqrt((D.cling * skill * A.room) / sharp)
    if (sharp > A.drift) {
      corner = Math.max(corner, (D.carve * skill * A.room) / sharp)
      if (k <= A.entry && sharp > Math.abs(tight)) tight = curve
    }
    allowed = Math.min(allowed, Math.sqrt(corner * corner + 2 * A.brake * k))
  }
  const throttle = speed < allowed ? 1 : 0
  const brake = speed > allowed + A.margin ? 1 : 0
  if (d.drift) {
    // the turn a drift makes is its slip, and the slip is what the wheel feeds it: so the wheel is
    // held into the drift as far as the turn wanted needs, the bend's own and a turn back onto the
    // line, and turned against it when the line wants less than the slide gives
    // the course still turns as the slip dies, `carve` / `angle` × slip / `restore` radians if let
    // go now: that much of the way to the line is already coming
    const course = math.atan2(d.vel[0], d.vel[1])
    const coming = (D.carve * Math.abs(d.slip)) / D.angle / D.restore
    const e = angle(want - course) + d.drift * coming
    const curve = sample(t, at.s + speed * A.hold).curve
    const need = (-curve * speed - e * A.carve) * d.drift
    const fed = D.carve * (d.throttle > 0 ? 1 : D.lift)
    return { steer: clamp(need / fed, -1, 1) * d.drift, throttle, brake, handbrake: 0 }
  }
  // a tight bend close, taken faster than `eager` of what grip allows: the wheel turned full into it,
  // and the handbrake pulled once it has wound past the drive plugin's least turn for a drift
  const grip = tight ? A.eager * Math.sqrt((D.cling * skill) / Math.abs(tight)) : Infinity
  const into = -Math.sign(tight)
  const throwing = tight !== 0 && speed > grip && Math.sign(-angle(want - d.yaw)) !== -into
  return {
    steer: throwing ? into : clamp(-angle(want - d.yaw) * A.steer, -1, 1),
    throttle,
    brake,
    handbrake: throwing && Math.sign(d.wheel) === into && Math.abs(d.wheel) > 0.3 ? 1 : 0,
  }
}

// Whether the race lets its racers drive: once it has gone (the `race` kind's `phase`).
export const racing = (race: Row) => race.data.phase === 'go' || race.data.phase === 'results'

// One step of a racer in the race `race`: driven when the race lets it, and timed. What `drive`
// moves it by is handed back.
export function run(me: Row, dt: number, w: W, race: Row) {
  if (me.data.seg < 0 || !racing(race)) return
  const moved = drive(me, dt, w)
  timing(me, race.data.clock, moved, def(w, race.kind).laps)
}

// The race's timing of a racer after a step of `drive` that completed `moved.laps` laps and
// `moved.splits` checkpoints, at the race's `clock`: each lap done is its `last`, its `best` the least
// of them, and the next lap starts; its `laps`th lap done is its finish, `done`. A finished racer
// counts no more.
export function timing(me: Row, clock: number, moved: { laps: number; splits: number }, laps: number) {
  const d = me.data
  if (d.done >= 0) return
  if (moved.splits) {
    d.split += moved.splits
    d.splitAt = clock
  }
  for (let k = 0; k < moved.laps; k++) {
    d.last = clock - d.lapAt
    d.best = d.best < 0 ? d.last : Math.min(d.best, d.last)
    d.lapAt = clock
    d.lap += 1
    if (d.lap >= laps) {
      d.done = clock
      return
    }
  }
}

// A wall or a racer touched: a drift going on is no longer clean.
function hit(d: any) {
  d.scrape = 0
  if (d.drift) d.clean = false
}
