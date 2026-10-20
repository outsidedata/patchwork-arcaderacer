// The server half of box3dvehicle: a car made of box3d rows out of one description, driven by
// throttle, brake and steer, riding on a suspension of its own.
//
// A car is box3d rows, since box3d makes one body per row and one joint per row: a chassis, a wheel
// for each corner and a wheel joint joining each to the chassis. There is one `box3dvehicle` row per
// car. It holds `vehicle`, the name of the fleet's Vehicle it is (below), and what changes:
// `throttle` (-1 to 1), `brake` (0 to 1), `steer` (-1 to 1, positive turns left), and `chassis`,
// `wheels` and `joints`, the ids of its parts. Its actor entry gives `pos` and `rot`, where the car
// is made: on the row's first step box3dvehicle spawns the parts there, each wheel where the spring
// holds it at rest, and takes `pos` and `rot` off the row, so it carries nothing that no longer
// changes. A rule that makes a car in a step makes it with `vehicle(w, name, pos, rot)`, which
// spawns the row with its parts made and its joints driven: a row
// spawned in a step is sent before any hook of it runs, so it is spawned whole. Each step it also writes what each corner's suspension
// is doing, a number per wheel, as it was at the start of the step: `compression`, metres
// the spring is pushed in from full droop; `load`, newtons the suspension pushes the chassis up with
// there, and the wheel down; `grounded`, whether the wheel touches anything.
//
// What never changes is the scene's `world.box3dvehicle`, a Fleet:
//   chassis, wheel, joint  the kinds of the parts' rows, every car's. box3d is handed their entries
//              by this plugin's mod (`box3dvehicle.box3d.ts`, named in `world.box3d.mods.kinds`),
//              each made from the Vehicle of the car that lists the part, so the scene's
//              `world.box3d` lists none of them.
//   vehicles   name to Vehicle: the cars the scene can make. `design(world, row)` is a car's.
//   mods       below.
// A Vehicle is the whole car, which the body, the wheels, the joints and the look are all made from:
//   body      the chassis: a box `length` along x, `height` along y and `width` along z, centred on
//              the chassis's origin, `mass` kg with its centre of mass at `center` in the chassis's
//              frame, `friction`, and with `cabin` a cabin on its top: a four-sided hull `length`
//              long and `width` wide at its base, `top` long and `topWidth` wide at its roof,
//              `height` high, its middle `at` along x. A body with no `cabin` is its box alone, in the
//              bodies box3d makes (`box3dvehicle.box3d.ts`) and in the look, as a trailer's chassis
//              is. Its inertia is a uniform box's of the body's size and mass, cabin or none.
//   bodies     Body fields (`plugins/box3d`) every part takes, as `enableContactRecycling`.
//   axles      the wheels, a pair per axle, left (-z) then right (+z), axle after axle:
//     at         where the axle is along the chassis's x.
//     track      the distance between its two wheels' centres.
//     mount      the height of the springs' top mounts in the chassis's frame. Each mount is
//                straight above its wheel's inner face, `track` / 2 − `wheel.width` / 2 out.
//     wheel      `radius`, `width`, `mass` kg, `friction` and `rollingResistance`. Box3D rolls it as
//                a ball of its radius (`box3dvehicle.box3d.ts`) and grips by Coulomb friction, its
//                `friction` times the load on it, so its width places its mount, sets how it spins,
//                and is drawn, and grips no harder. A hard tyre is a low `friction` and
//                `rollingResistance`, a soft one high.
//     spring     `stiffness` N/m; `length`, how far below its mount the wheel's inner face hangs at
//                full droop; `travel`, how far it can be pushed up from there; `sag`, how far it
//                is pushed in when the car stands still on flat ground. Each spring is preloaded
//                to carry, at `sag`, its share of the chassis's weight (`loads`) in the scene's
//                gravity (`mods`, below).
//     damper     N·s/m: `bump`, pushed in, and `rebound`, pulled out.
//     bumpStop   the last `length` of the travel pushes back harder, `stiffness` N/m more at its
//                start, growing to twice that at full travel.
//     antiRoll   N/m on the difference between the axle's two compressions: the more pushed-in wheel
//                is pushed down that much more and the other that much less.
//     driven, steered  whether the throttle turns its wheels and the steering steers them: front,
//                rear or every axle driven is front, rear or four-wheel drive. A steered axle
//                behind the middle of the wheelbase turns its wheels the other way, as a
//                combine's rear wheels do, so a positive steer turns every car left. A petrol engine's
//                torque is shared equally among the driven wheels, so the layout moves the push,
//                not how much there is.
//   engine     one of three. Direct drive, each driven wheel a motor of its own: `spinSpeed` rad/s, a
//              driven wheel's motor speed at throttle 1; `spinTorque` N·m, a
//              driven wheel's motor torque while the throttle is held; `brakeTorque` N·m, each
//              wheel's motor torque at brake 1, holding it at no spin; `coastTorque` N·m, each
//              wheel's motor torque holding it at no spin while neither is held, as an engine's drag
//              does, 0 and the wheels roll free. Or a petrol engine through a manual gearbox, told by
//              its `curve`, `[rpm, N·m]` at full throttle: `idle`, `launch` (the rpm the clutch slips
//              at, full throttle, pulling away), `redline` (the limiter), `revRate` (rpm/s, revving in
//              neutral), `friction` ([N·m, N·m per 1000 rpm], engine braking), `gears` (ratios, 1st
//              up), `reverse`, `final`, `efficiency` and `brakeTorque` as above (`petrol`, below), and
//              with `automatic` the gearbox picks the forward gear itself (`choose`, below). Or an
//              electric motor through one reduction: `torque` N·m up to the speed where it makes
//              `power` W, then that power, to its `redline` rpm, through `ratio`, `efficiency`, with
//              `regen` N·m braking it with the throttle shut, and `brakeTorque` (`electric`, below).
//              A petrol or electric car's row carries `gear` and writes `rpm` and `torque` each step.
//   steering   `angle` radians, a steered wheel's target at steer 1, and its joint's `hertz`,
//              `dampingRatio` and `maxTorque`.
//   pedal      `{ stop }`, m/s: how the one pedal of a car that picks its own forward gear changes
//              its way (Driving, below). A car driven by its `pedal` that picks its gear and gives
//              none throws on the step, saying so.
//   look       how the browser half draws the car (`box3dvehicle.plugin.ts`): the body it draws from
//              these numbers, or, with `model`, `{ asset, at?, scale? }`, the loader catalogue's
//              `model` entry `asset` drawn on the chassis in its place, its origin at `at` in the
//              chassis's frame ([0, 0, 0] when left out) and `scale` metres to one of its units (1
//              when left out). The bodies are the same whichever it is: the model is the look alone.
//              With `sound`, the engine is heard, from loops of it held at fixed rpms, played by the
//              browser half through the `sound` mod (below), following the row's `rpm` and `throttle`.
//              Its `points`, `{ <name>: [x, y, z] | { at, part?, turn? } }`, are named places of the
//              car in the chassis's frame (a seat, the grips on the steering wheel), which the page
//              draws as empties and box3dvehicle's mod for interact (`box3dvehicle.interact.ts`) hands
//              out; `pointOf(v, name)` is one as `{ at, part, turn }`, or undefined for a name the look
//              has not.
//   hit        `{ speed, damage }`: a chassis moving at `speed` m/s or faster hits the bodies its box
//              meets, each struck for `damage` for each m/s it moves (`hits`, below). With no `hit`,
//              or no `bodies` and `strike` mods, no car hits anything.
//   mods       `{ gravity: '<a>', land: '<a>', grip: '<a>', drag: '<a>', bodies: '<a>', strike: '<a>', sound: '<a>' }`, each the plugin whose mod gives box3dvehicle that
//              function (`addons/scenemanager`'s mods): `gravity(w)` hands back the gravity the car's
//              parts fall by, a vector (box3d's, `box3d.box3dvehicle.ts`, the gravity its world steps
//              with), whose length is the g every spring's preload and every readout of the ride is
//              worked out in (`pull`); `land(plugins)` is the browser half's, the ground its dust is
//              thrown from. A car is box3d bodies, which fall by box3d's gravity and nothing else, so
//              its springs carry no weight a scene does not name: a car in a scene that names no
//              `gravity` throws on its first step. `grip(w, x, z)` hands back how well the ground at
//              [x, z] grips, a multiplier: each step every wheel row's `friction` (box3d's live
//              friction) is set so its contact's friction is what it is on grip 1 times the grip
//              under it (`grips`), so a wheel grips as the ground it is on. With no `grip`, every wheel grips at its `wheel.friction` everywhere.
//              `drag(w, x, z)` hands back the ground's rolling resistance at [x, z], newtons per newton
//              of load: each step every wheel on the ground is pushed against the way it goes across
//              the ground by that times what its corner's spring pushes it down with, as soft ground sinks a tyre and holds it
//              back, never by more than takes its share of the car to a stop that step (`drags`). With
//              no `drag`, the ground holds no wheel back. `bodies(w)` hands back the bodies a car
//              can hit, each `{ id, kind, pos, shapes }`, its shapes capsules and upright cylinders,
//              and `strike(w, row, struck)` hurts one, with a `Struck` whose `what` is `'car'`:
//              hitscan3d's calls its row's `hit` act (`hitscan3d.box3dvehicle.ts`); dismember3d's
//              crushes a body that comes apart and lays it down (`dismember3d.box3dvehicle.ts`).
//              `sound(plugins)` is the browser half's: how the page decodes a file's bytes and holds a
//              sound going and placed, each car's engine, `{ decode, hold }`, or undefined on a page with
//              no Web Audio (audio's, `audio.box3dvehicle.ts`).
// Driving. A car's driver is whatever writes its `throttle`, `brake`, `steer` and `gear`: a rule
// writing them straight onto the row, or a seat through the car's acts, which a game's `player` row
// passes on to the car it holds (`relay` in `plugins/player/player.sim.ts`). None is `open`, so a seat
// reaches a car only through a `player` row that holds it, and each takes only a finite number,
// kept to its range:
//   pedal(v)    -1 to 1, kept on the row as `pedal`: the one pedal of an arcade car. A car that picks
//               its own forward gear (`automatic`) brakes with it held back while it rolls forward,
//               and once it goes slower than its Vehicle's `pedal.stop` along its heading the car is
//               put in reverse and the same pedal drives it backwards; pushed forward, it brakes the
//               car while it rolls backwards, and below `stop` puts it back in drive. So in reverse
//               the throttle is the pedal turned round. Any other car takes the pedal as its
//               throttle. The pedal reaches the throttle and the gear each step in `before`, before
//               the wheels are driven, while the row's `pedal` is a number.
//   throttle(v) -1 to 1: the throttle itself, and the pedal let go of (`pedal` null).
//   steer(v)    -1 to 1, positive left.
//   brake(v)    0 to 1.
//   shift(by)   1 or -1: the gear moved by one (`shift`, below).
// What a car does while nobody drives it is its game's.
//
// The car's forward is its chassis's +x, up its +y, and left its -z. A wheel joint's frame on the
// chassis is turned a quarter about z from the chassis's, so its axis runs up the chassis's y, and
// the wheel spins about z, across the car.
//
// Each step, in `before`: the joint rows' `spinSpeed`, `maxSpinTorque` and `targetSteeringAngle` from
// the row's throttle, brake and steer; and each corner's suspension, on its joint row too, and box3d
// pushes all of it to the live joints in its `tick`. The suspension is Box3D's own spring on the
// wheel joint, solved inside the step with the contacts, so it cannot overshoot however stiff it is,
// set each step to push as this corner's does now and to grow as it would as the wheel moves in: the
// push `f` of the spring, the bump stop and the anti-roll bar at this compression `c`, and `k`, how
// many newtons more each metre in adds (the spring's stiffness while it pushes at all, the bump
// stop's rate there, the anti-roll bar's). Box3D's spring pushes by its stiffness times how far the
// wheel is from the joint frame's origin along the axis, so the frame on the chassis is put `f / k`
// below the wheel, the suspension limits follow it so they stay the ends of the travel, the hertz
// is the one that makes its stiffness `k` on the mass the two ends move with against each other
// (`reach`), which is the mass Box3D's spring works on, and the damping ratio the one that makes its
// damping the damper's `bump` or `rebound`, whichever way the wheel is moving. While nothing pushes
// (`k` 0: the spring hangs loose, and no anti-roll bar), Box3D's spring is off and the damper is a
// push of its own, the impulse that takes the wheel's speed against the chassis down by
// 1 − e^(−c·dt/m), which never turns it round. `before` runs ahead of every `tick`, so its order
// against box3d in the scene's actors does not matter.
import type { Kind, Row, W } from '#engine/engine.ts'
import { b3, type Body, type Push, type Quat, type Vec3 } from '#plugins/box3d/box3d.sim.ts'
import * as math from '#plugins/math/math.sim.ts'
import { mod } from '#addons/scenemanager/scenemanager.addon.ts'

export type Wheel = { radius: number; width: number; mass: number; friction: number; rollingResistance: number }
export type Axle = {
  at: number
  track: number
  mount: number
  wheel: Wheel
  spring: { stiffness: number; length: number; travel: number; sag: number }
  damper: { bump: number; rebound: number }
  bumpStop: { length: number; stiffness: number }
  antiRoll: number
  driven: boolean
  steered: boolean
}
export type Direct = { spinSpeed: number; spinTorque: number; brakeTorque: number; coastTorque: number }
export type Electric = {
  torque: number
  power: number
  redline: number
  ratio: number
  efficiency: number
  regen: number
  brakeTorque: number
}
export type Petrol = {
  curve: [rpm: number, torque: number][]
  idle: number
  launch: number
  redline: number
  revRate: number
  friction: [base: number, perThousand: number]
  gears: number[]
  reverse: number
  final: number
  efficiency: number
  brakeTorque: number
  automatic?: { up: [light: number, full: number]; down: [light: number, full: number] }
}
export type Cabin = { at: number; length: number; width: number; top: number; topWidth: number; height: number }
export type Paint = {
  body: number; cabin: number; trim: number; glass: number; light: number; tail: number; amber: number
  tyre: number; rim: number; chrome: number; seat: number; hook: number; spring: number; damper: number; arm: number
}
export type Finish = {
  roughness: number; metalness: number
  clearcoat?: number; clearcoatRoughness?: number; sheen?: number; sheenRoughness?: number; opacity?: number
}
export type Open = {
  windshield: { height: number; lean: number; frame: number; wiper: number }
  cage: { height: number; tube: number; bend: number; pad: number }
  wall: number
  floor: number
  corner: number
  door: { from: number; to: number; drop: number; ease: number }
  rib: { at: number; depth: number; height: number }
  seat: { width: number; depth: number; base: number; back: number; round: number; tilt: number; head: number }
  bench?: boolean
  steer: number
  dash: { depth: number; height: number }
  tunnel?: { width: number; height: number }
  stick?: number
  hood: { drop: number; round: number; dome?: { inset: number; height: number } }
  rocker?: { height: number; depth: number }
  mirror?: { size: number; arm: number }
}
export type Lamp = { intensity: number; distance: number; decay: number }
export type Lights = {
  radius: number; depth: number; bezel: number
  beam: Lamp & { angle: number; penumbra: number; dip: number }
  tail: { glow: number; brake: number; light: Lamp }
  reverse: { glow: number; light: Lamp }
  parking?: { radius: number; depth: number; glow: number }
}
export type Tracks = { colour: number; opacity: number; skid: number; slide: number; clear: number; step: number; life: number; max: number; lift: number }
// A model drawn on the chassis in place of the body the look draws: the loader catalogue's `model`
// entry `asset`, its origin at `at` in the chassis's frame, `scale` metres to one of its units.
export type Model = { asset: string; at?: Vec3; scale?: number }
// One tailpipe: its tip `at` and the way it points `dir` in the chassis's frame, `pipe` round,
// throwing particle3d's `effect`, and `rev` beside it while the throttle is held.
export type Exhaust = { at: Vec3; dir: Vec3; pipe: number; effect: string; rev?: string }
// A named point of the car, in the chassis's frame: where it is, at its place, or `{ at, part, turn }`,
// riding the steering wheel with `part: 'steer'` and turned `turn`, a quaternion [x, y, z, w].
export type Spot = { at: Vec3; part?: 'steer'; turn?: Quat }
export type Point = Vec3 | Spot
// The look's point `name` as `{ at, part, turn }`, or undefined for a name it has not.
export function pointOf(v: Vehicle, name: string): Spot | undefined {
  const points = v.look.points
  if (!points || !Object.hasOwn(points, name)) return undefined
  const p = points[name]
  return Array.isArray(p) ? { at: p } : p
}
// A car's engine as it is heard (`box3dvehicle.plugin.ts`): `engine`, the loader catalogue's `json` entry
// of its manifest (an Engine); each stem's gain from throttle shut to full, `stems`, and the seconds the
// heard throttle takes to follow the row's, `ease`, each over the manifest's own; where in the chassis's
// frame it sounds from, `at`; and `range`, the metres it fades out over in place of the listener's own.
export type Sound = {
  engine: string
  stems?: Record<string, [shut: number, full: number]>
  ease?: number
  at?: Vec3
  range?: number
}
// An engine's manifest, as the library's `sounds/sounds.mjs` writes it beside its loops: `order`, the
// times a turn of the crank its own tone sounds (a piston engine's firings a turn, a motor's electrical
// cycles), which nothing here plays by and a page that draws its spectrum lines up with; its `mix`, each
// stem's gain from throttle shut to full and the heard throttle's ease; and its `layers`, each the engine
// held at `rpm`, as the file of each of its stems, named as it stands beside the manifest.
export type Engine = {
  order?: number
  mix?: { stems: Record<string, [shut: number, full: number]>; ease?: number }
  layers: { rpm: number; stems: Record<string, string> }[]
}
export type Look = {
  paint: Paint; finish?: Partial<Record<keyof Paint, Finish>>; segments: number; spokes: number; rim: number; coils: number; coilRadius: number; wire: number; arm: number
  sound?: Sound
  inboard?: number
  tread?: { blocks: number; depth: number; angle: number }
  fenders?: { gap: number; thickness: number; flare: number; round: number; ease: number; square: number }
  bumpers?: { depth: number; height: number; overhang: number; round: number; bolts: number; hooks?: number }
  grille?: { slots: number; width: number; height: number; depth: number; paint: keyof Paint }
  lights?: Lights
  spare?: { lift: number }
  exhaust?: Exhaust[]
  dust?: { effect: string; clear: number; speed: number }
  tracks?: Tracks
  open?: Open
  model?: Model
  lock?: number
  points?: Record<string, Point>
  solid?: Solid
}
// A link of a solid axle: from `frame`, its end on the chassis, to `on`, its end on the axle (`solid`,
// below, says how each is read).
export type Link = { frame: Vec3; on: Vec3 }
// One shock of each wheel's cluster on a solid axle (`solid`, below).
export type Shock = {
  along: number; on: [up: number, across: number]; top: [y: number, across: number]
  radius: number; body: number; shaft: number
  coil?: { radius: number; wire: number; turns: number; low: number; high: number; free: number }
  reservoir?: { radius: number; length: number; gap: number }
}
// The drawing of a car on solid axles (`look.solid`, `box3dvehicle.plugin.ts`), every axle's.
export type Solid = {
  pivot: number
  housing: number
  pumpkin: { radius: number; pinion: { radius: number; length: number }; cover: number }
  knuckle: { radius: number; height: number }
  brake: { radius: number; thick: number; at: number; caliper: number }
  links: { radius: number; end: number; lower: Link; upper: Link; track: Link }
  shocks: Shock[]
  ceiling: number
  bump: { across: number; radius: number }
  strap: { along: number; across: number; drop: number; width: number; thick: number; length: number }
  steer: { arm: [along: number, up: number, inward: number]; rod: number; ram: { on: Vec3; to: number; radius: number; length: number; rod: number } }
  shaft: { radius: number; joint: [radius: number, length: number]; slip: [radius: number, length: number] }
  axles: { pumpkin: number; shaft: Vec3 }[]
}
export type Vehicle = {
  body: { length: number; width: number; height: number; mass: number; center: Vec3; friction: number; cabin?: Cabin }
  bodies: Omit<Partial<Body>, 'shapes' | 'mass'>
  axles: Axle[]
  engine: Direct | Petrol | Electric
  steering: { angle: number; hertz: number; dampingRatio: number; maxTorque: number }
  pedal?: { stop: number }
  look: Look
}
export type Fleet = {
  chassis: string
  wheel: string
  joint: string
  vehicles: Record<string, Vehicle>
  hit?: { speed: number; damage: number }
  mods?: { gravity?: string; land?: string; grip?: string; drag?: string; bodies?: string; strike?: string; sound?: string }
}

// A body a car can hit, as hitscan3d's `bodies` mod hands it (`plugins/hitscan3d`'s Body).
type Struckable = { id: number; kind: string; pos: number[]; shapes: ({ part: string } & ({ cylinder: { pos: number[]; radius: number; height: number } } | { capsule: { a: number[]; b: number[]; radius: number } }))[] }
type Bodies = (w: W) => Struckable[]
type Strike = (w: W, row: Row, struck: { damage: number; by: number; part: string; point: number[]; dir: number[]; what: 'car'; speed: number }) => void

/** The Vehicle a `box3dvehicle` row is: the one of the scene's fleet its `vehicle` names. */
export function design(world: Record<string, any>, car: Row): Vehicle {
  const fleet: Fleet = world.box3dvehicle, v = fleet.vehicles[car.data.vehicle]
  if (!v) throw new Error(`box3dvehicle: car ${car.id} is a ${car.data.vehicle}, and world.box3dvehicle.vehicles has ${Object.keys(fleet.vehicles).join(', ')}`)
  return v
}

// ---------------------------------------------------------------- the car's shape

// v turned by the quaternion q.
export function turn(q: Quat, v: Vec3): Vec3 {
  const [x, y, z, s] = q
  const t = [2 * (y * v[2] - z * v[1]), 2 * (z * v[0] - x * v[2]), 2 * (x * v[1] - y * v[0])]
  return [v[0] + s * t[0] + (y * t[2] - z * t[1]), v[1] + s * t[1] + (z * t[0] - x * t[2]), v[2] + s * t[2] + (x * t[1] - y * t[0])]
}
const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const scale = (a: Vec3, k: number): Vec3 => [a[0] * k, a[1] * k, a[2] * k]
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
export const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]

// One wheel of the car: its axle, its side (-1 left, 1 right), its spring's top mount in the
// chassis's frame, and the point of the wheel the spring holds, its inner face's middle, in the
// wheel's own frame.
export type Corner = { axle: Axle; side: number; mount: Vec3; hub: Vec3 }
export function corners(v: Vehicle): Corner[] {
  return v.axles.flatMap(axle => [-1, 1].map(side => ({
    axle, side,
    mount: [axle.at, axle.mount, side * (axle.track / 2 - axle.wheel.width / 2)] as Vec3,
    hub: [0, 0, -side * axle.wheel.width / 2] as Vec3,
  })))
}

// Where a wheel's middle is in the chassis's frame when its spring is pushed in `compression`.
export const wheelAt = (c: Corner, compression: number): Vec3 =>
  [c.mount[0], c.mount[1] - (c.axle.spring.length - compression), c.side * c.axle.track / 2]

// A cabin's eight corners in the chassis's frame, on top of `v`'s body, base then roof, as a flat
// [x, y, z, …].
export function cabinPoints(v: Vehicle, cabin: Cabin): number[] {
  const base = v.body.height / 2, roof = base + cabin.height
  const ring = (y: number, l: number, wd: number) => [[1, 1], [1, -1], [-1, -1], [-1, 1]].flatMap(([a, b]) => [cabin.at + (a * l) / 2, y, (b * wd) / 2])
  return [...ring(base, cabin.length, cabin.width), ...ring(roof, cabin.top, cabin.topWidth)]
}

// One drawn part of a solid axle, in the chassis's frame: a `tube` `r` round from `a` to `b`; a `ball`
// `r` round at `a`; a `coil` of `turns` turns `r` round in wire `wire` thick from `a` to `b`; or a
// `band` `r` × 2 wide and `thick` thick from `a` to `b`. `mount` when its `a` end sits on the body.
export type Part = {
  name: string; shape: 'tube' | 'ball' | 'coil' | 'band'; a: Vec3; b: Vec3; r: number; paint: keyof Paint
  turns?: number; wire?: number; thick?: number; mount?: boolean
}
const norm = (a: Vec3): Vec3 => scale(a, 1 / (Math.hypot(a[0], a[1], a[2]) || 1))
const length = (a: Vec3) => Math.hypot(a[0], a[1], a[2])
// How many pieces a limit strap is drawn in.
export const STRAP = 16

// Every part of axle `i` of `v`'s solid axles (`look.solid`), in the chassis's frame, with its left
// wheel's middle at `left` and its right's at `right`, steered `steerL` and `steerR` radians (positive
// left, about the chassis's y), always as many parts in the same order. The housing runs between the
// two knuckles' pivots, `pivot` in from each wheel's middle, so it tilts as one wheel rises and the
// other falls; everything on the axle is placed in its frame (its x the chassis's forward square to
// it, z along it to the right, y up from it), each knuckle, its brake and steering arm in the frame of
// its wheel turned by its steering about the wheel's middle, and the chassis's ends of the links,
// shocks, bump stops, straps and driveshafts where the chassis holds them. A length along x is
// in toward the car's middle (back from a front axle, forward from a rear one) and a length across is
// out toward each wheel's side, except the track bar's and the steering ram's, which are given as
// they stand: z positive to the right.
export function solidParts(v: Vehicle, i: number, left: Vec3, right: Vec3, steerL: number, steerR: number): Part[] {
  const s = v.look.solid!, axle = v.axles[i], t = axle.at >= 0 ? -1 : 1, mine = s.axles[i]
  const across = norm(sub(right, left))
  const pivots = [add(left, scale(across, s.pivot)), sub(right, scale(across, s.pivot))]
  const O = scale(add(pivots[0], pivots[1]), 0.5), Z = across
  const X = norm(sub([1, 0, 0], scale(Z, Z[0]))), Y = cross(Z, X)
  const on = (p: Vec3): Vec3 => add(O, add(scale(X, p[0]), add(scale(Y, p[1]), scale(Z, p[2]))))
  const chassis = (p: Vec3): Vec3 => [axle.at + p[0], p[1], p[2]]
  // A point of side `side`'s knuckle: `p` along, up and in toward the car's middle from its wheel's middle.
  const knuckle = (side: number, p: Vec3): Vec3 => {
    const c = side < 0 ? left : right, a = side < 0 ? steerL : steerR, q: Vec3 = [p[0], p[1], -side * p[2]]
    return add(c, [q[0] * Math.cos(a) + q[2] * Math.sin(a), q[1], -q[0] * Math.sin(a) + q[2] * Math.cos(a)])
  }
  const parts: Part[] = []
  const tube = (name: string, a: Vec3, b: Vec3, r: number, paint: keyof Paint, mount = false) => parts.push({ name, shape: 'tube', a, b, r, paint, mount })
  const ball = (name: string, a: Vec3, r: number, paint: keyof Paint) => parts.push({ name, shape: 'ball', a, b: a, r, paint })

  // the housing, the pumpkin, its pinion toward the driveshaft and its cover the other way
  const pk = s.pumpkin, middle = on([0, 0, mine.pumpkin])
  tube('housing', pivots[0], pivots[1], s.housing, 'arm')
  ball('pumpkin', middle, pk.radius, 'arm')
  const pinion = on([t * (pk.radius + pk.pinion.length), 0, mine.pumpkin])
  tube('pinion', on([t * pk.radius * 0.5, 0, mine.pumpkin]), pinion, pk.pinion.radius, 'arm')
  tube('cover', on([-t * pk.radius * 0.6, 0, mine.pumpkin]), on([-t * (pk.radius * 0.6 + 0.04), 0, mine.pumpkin]), pk.cover, 'chrome')

  // each knuckle with its brake, and on a steered axle its arm
  const arms: Vec3[] = []
  for (const side of [-1, 1]) {
    const k = s.knuckle, b = s.brake, n = side < 0 ? 'L' : 'R'
    tube(`knuckle.${n}`, knuckle(side, [0, -k.height / 2, s.pivot]), knuckle(side, [0, k.height / 2, s.pivot]), k.radius, 'arm')
    tube(`disc.${n}`, knuckle(side, [0, 0, b.at - b.thick / 2]), knuckle(side, [0, 0, b.at + b.thick / 2]), b.radius, 'damper')
    tube(`caliper.${n}`, knuckle(side, [0, b.radius * 0.82, b.at - 0.05]), knuckle(side, [0, b.radius * 0.82, b.at + 0.05]), b.caliper, 'hook')
    if (axle.steered) {
      const [along, up, inward] = s.steer.arm, end = knuckle(side, [t * along, up, inward])
      tube(`arm.${n}`, knuckle(side, [0, up, s.pivot]), end, s.steer.rod, 'arm')
      arms.push(end)
    }
  }
  if (axle.steered) {
    const r = s.steer.ram
    tube('tierod', arms[0], arms[1], s.steer.rod, 'arm')
    const from = on([t * r.on[0], r.on[1], r.on[2]]), to = add(arms[0], scale(sub(arms[1], arms[0]), r.to))
    tube('ram', from, add(from, scale(norm(sub(to, from)), r.length)), r.radius, 'arm')
    tube('ram.rod', from, to, r.rod, 'chrome')
  }

  // the four links each side and the track bar, a rod end where each meets the axle
  const L = s.links
  for (const side of [-1, 1]) {
    for (const [name, link] of [['lower', L.lower], ['upper', L.upper]] as const) {
      const b = on([t * link.on[0], link.on[1], side * link.on[2]])
      tube(`${name}.${side < 0 ? 'L' : 'R'}`, chassis([t * link.frame[0], link.frame[1], side * link.frame[2]]), b, L.radius, 'arm', true)
      ball(`${name}.end.${side < 0 ? 'L' : 'R'}`, b, L.end, 'arm')
    }
  }
  const bar = on([t * L.track.on[0], L.track.on[1], L.track.on[2]])
  tube('track', chassis([t * L.track.frame[0], L.track.frame[1], L.track.frame[2]]), bar, L.radius, 'arm', true)
  ball('track.end', bar, L.end, 'arm')

  // each wheel's shocks: a body hanging from its top, a shaft up into it from the axle, and on a
  // coilover a coil between a perch on the shaft and one on the body, on a bypass shock a reservoir.
  // A coil is never longer than its `free` length: past it, it sits on its lower perch and rides
  // down with the axle, clear of the upper one, as an unloaded spring does.
  for (const side of [-1, 1]) for (const [k, sh] of s.shocks.entries()) {
    const n = `shock${k}.${side < 0 ? 'L' : 'R'}`
    const low = on([t * sh.along, sh.on[0], side * sh.on[1]]), top = chassis([t * sh.along, sh.top[0], side * sh.top[1]])
    const down = norm(sub(low, top))
    tube(`${n}.body`, top, add(top, scale(down, sh.body)), sh.radius, 'chrome', true)
    // the shaft runs from the axle up into the body, ending halfway up it
    tube(`${n}.shaft`, low, add(top, scale(down, sh.body / 2)), sh.shaft, 'chrome')
    if (sh.coil) {
      const c = sh.coil, a = sub(low, scale(down, c.low)), b = add(top, scale(down, c.high))
      parts.push({ name: `${n}.coil`, shape: 'coil', a, b: sub(a, scale(down, Math.min(length(sub(b, a)), c.free))), r: c.radius, paint: 'spring', turns: c.turns, wire: c.wire })
      tube(`${n}.perch.low`, a, sub(a, scale(down, 0.015)), c.radius + c.wire, 'arm')
      tube(`${n}.perch.high`, b, add(b, scale(down, 0.015)), c.radius + c.wire, 'arm')
    }
    if (sh.reservoir) {
      const r = sh.reservoir, aside = scale(norm(cross(down, X)), side * r.gap)
      tube(`${n}.reservoir`, add(top, add(aside, scale(down, 0.02))), add(top, add(aside, scale(down, 0.02 + r.length))), r.radius, 'chrome', true)
    }
  }

  // each side's bump stop, from the ceiling down to where the housing's top is at full bump
  const full = axle.mount - axle.spring.length + axle.spring.travel + s.housing
  for (const side of [-1, 1]) tube(`bump.${side < 0 ? 'L' : 'R'}`, chassis([0, s.ceiling, side * s.bump.across]), chassis([0, full, side * s.bump.across]), s.bump.radius, 'trim', true)

  // each side's limit strap, `length` long from a tab `drop` under the ceiling to the housing's top, in
  // `STRAP` pieces: straight once pulled tight, else folded back and forth, every other bend standing
  // out from the line between its ends toward the axle (away from the car's middle) by as much as
  // takes up the slack
  const st = s.strap
  for (const side of [-1, 1]) {
    const top = chassis([t * st.along, s.ceiling - st.drop, side * st.across]), low = on([t * st.along, s.housing, side * st.across])
    const chord = sub(low, top), u = norm(chord), m = scale(norm(sub(X, scale(u, dot(X, u)))), -t)
    const piece = st.length / STRAP, step = length(chord) / STRAP, fold = Math.sqrt(Math.max(0, piece * piece - step * step))
    const at = (k: number): Vec3 => add(top, add(scale(chord, k / STRAP), scale(m, k % 2 ? fold : 0)))
    for (let k = 0; k < STRAP; k++) parts.push({ name: `strap${k}.${side < 0 ? 'L' : 'R'}`, shape: 'band', a: at(k), b: at(k + 1), r: st.width / 2, thick: st.thick, paint: 'hook', mount: k === 0 })
  }

  // the driveshaft from the transfer case's output to the pinion: a slip yoke, the shaft, a joint
  const sf = s.shaft, from = mine.shaft, u = norm(sub(pinion, from))
  tube('slip', from, add(from, scale(u, sf.slip[1])), sf.slip[0], 'arm', true)
  tube('shaft', add(from, scale(u, sf.slip[1])), sub(pinion, scale(u, sf.joint[1])), sf.radius, 'arm')
  tube('joint', sub(pinion, scale(u, sf.joint[1])), pinion, sf.joint[0], 'chrome')
  return parts
}

// The chassis's inertia about its centre of mass, a uniform box's of the body's size: about x
// (roll), y (yaw) and z (pitch).
export function inertia(v: Vehicle): Vec3 {
  const { length: l, height: h, width: wd, mass: m } = v.body
  return [(m * (h * h + wd * wd)) / 12, (m * (l * l + wd * wd)) / 12, (m * (l * l + h * h)) / 12]
}
// A wheel's inertia about its middle, a uniform cylinder's across z: about x, y and its spin axis z.
export function wheelInertia(wh: Wheel): Vec3 {
  const side = (wh.mass * (3 * wh.radius * wh.radius + wh.width * wh.width)) / 12
  return [side, side, (wh.mass * wh.radius * wh.radius) / 2]
}

// The mass a corner's two ends move with against each other along the chassis's up, as Box3D's
// wheel joint reckons it for its spring: the chassis's and the wheel's masses, and each one's turning
// about its centre of mass as the spring pushes it off-centre.
export function reach(v: Vehicle, c: Corner): number {
  const r = sub(c.mount, v.body.center), I = inertia(v), J = wheelInertia(c.axle.wheel)
  const chassis = 1 / v.body.mass + (r[2] * r[2]) / I[0] + (r[0] * r[0]) / I[2]
  const wheel = 1 / c.axle.wheel.mass + (c.hub[2] * c.hub[2]) / J[0]
  return 1 / (chassis + wheel)
}

// What a `gravity` mod is: the gravity the car's parts fall by in `w`.
export type Gravity = (w: W) => Vec3
// How hard the scene's gravity pulls, m/s²: the length of what its `gravity` mod hands back, or
// undefined when it names none.
export function pull(w: W): number | undefined {
  const g = mod<Gravity>(w.world, 'box3dvehicle', 'gravity')?.(w)
  return g && math.hypot(g[0], g[1], g[2])
}

// Each wheel's share of the chassis's weight, in newtons, standing still on flat ground: the shares
// that hold the chassis up and level about its centre of mass, each as the spring's stiffness times
// a height and a tilt along x and z that are the same for every wheel, which makes one answer for any
// number of axles and is the lever rule for two.
export function loads(v: Vehicle, g: number): number[] {
  const cs = corners(v), W = v.body.mass * g, [cx, , cz] = v.body.center
  const M = [[0, 0, 0], [0, 0, 0], [0, 0, 0]]
  for (const c of cs) {
    const f = [1, c.mount[0], c.mount[2]], k = c.axle.spring.stiffness
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) M[i][j] += k * f[i] * f[j]
  }
  const abc = solve(M, [W, W * cx, W * cz])
  if (!abc) throw new Error('box3dvehicle: the axles do not stand the chassis up: it needs wheels at two places along it and on both sides')
  return cs.map(c => c.axle.spring.stiffness * (abc[0] + abc[1] * c.mount[0] + abc[2] * c.mount[2]))
}

// M x = b for a 3×3 M, or undefined when M has no inverse.
function solve(M: number[][], b: number[]): number[] | undefined {
  const det = (m: number[][]) =>
    m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) - m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) + m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0])
  const d = det(M)
  const size = Math.max(...M.flat().map(Math.abs))
  if (!(Math.abs(d) > 1e-12 * math.pow(size, 3))) return undefined
  return [0, 1, 2].map(i => det(M.map((row, r) => row.map((x, k) => (k === i ? b[r] : x)))) / d)
}

// What an axle is on this car, standing still: each wheel's `load` (N) and the mass it carries
// (kg), how often the chassis bounces on the springs there (`hz`), how near the dampers come to
// stopping that bounce without passing the rest point, pushed in and pulled out (`bump`, `rebound`:
// 1 stops it exactly), and the gap under the body (`clearance`, m).
export type Ride = { load: number; carried: number; hz: number; bump: number; rebound: number; clearance: number }
export function ride(v: Vehicle, g: number): Ride[] {
  const all = loads(v, g)
  return v.axles.map((a, i) => {
    const load = all[2 * i], carried = load / g, k = a.spring.stiffness
    const critical = 2 * Math.sqrt(k * carried)
    return {
      load, carried,
      hz: Math.sqrt(k / carried) / (2 * Math.PI),
      bump: a.damper.bump / critical,
      rebound: a.damper.rebound / critical,
      clearance: a.wheel.radius + a.spring.length - a.spring.sag - a.mount - v.body.height / 2,
    }
  })
}

// A quarter turn about z: a wheel joint frame's x, its axis, laid along the chassis's y.
export const QUARTER: Quat = [0, 0, Math.SQRT1_2, Math.SQRT1_2]

// A corner's joint frame on the chassis, its origin on the axis where the wheel's inner face is when
// the spring is pushed in `c`.
export const frameA = (k: Corner, c: number) =>
  ({ pos: [k.mount[0], k.mount[1] + c - k.axle.spring.length, k.mount[2]] as Vec3, rot: QUARTER })

// ---------------------------------------------------------------- the rule

const still = (pos: Vec3, rot: Quat) => ({ pos, rot, vel: [0, 0, 0], spin: [0, 0, 0], awake: true })

// How high a car's chassis origin stands over flat ground at rest: a wheel's radius, the spring's
// length less its sag, less the mount's height, the highest of its axles'.
export const standing = (v: Vehicle) =>
  Math.max(...v.axles.map(a => a.wheel.radius + a.spring.length - a.spring.sag - a.mount))

function build(me: Row, v: Vehicle, w: W) {
  const fleet: Fleet = w.world.box3dvehicle
  const pos: Vec3 = me.data.pos, rot: Quat = me.data.rot
  const chassis = w.spawn(fleet.chassis, still([...pos] as Vec3, [...rot] as Quat))
  const wheels: number[] = [], joints: number[] = []
  for (const c of corners(v)) {
    const wheel = w.spawn(fleet.wheel, still(add(pos, turn(rot, wheelAt(c, c.axle.spring.sag))), [...rot] as Quat))
    const joint = w.spawn(fleet.joint, { a: chassis.id, b: wheel.id })
    wheels.push(wheel.id)
    joints.push(joint.id)
  }
  me.data.chassis = chassis.id
  me.data.wheels = wheels
  me.data.joints = joints
  delete me.data.pos
  delete me.data.rot
}

function drive(me: Row, v: Vehicle, w: W, dt: number) {
  const e = v.engine, steer: number = me.data.steer ?? 0
  const cs = corners(v), ats = v.axles.map(a => a.at), mid = (Math.max(...ats) + Math.min(...ats)) / 2
  // An axle behind the wheelbase's middle steers the other way, so a rear-steered car turns left
  // on a positive steer as a front-steered one does, and one steered at both ends turns tighter.
  cs.forEach((c, i) => {
    if (c.axle.steered) w.get(me.data.joints[i]).data.targetSteeringAngle = (c.axle.at < mid ? -1 : 1) * steer * v.steering.angle
  })
  if ('curve' in e) petrol(me, e, cs, w, dt)
  else if ('power' in e) electric(me, e, cs, w)
  else direct(me, e, cs, w)
}

// The driven wheels' mean forward spin against the chassis, rad/s, and their corners' places.
function drivenSpin(me: Row, cs: Corner[], w: W): { spin: number; driven: number[] } {
  const chassis = w.get(me.data.chassis).data
  const driven = cs.flatMap((c, i) => (c.axle.driven ? [i] : []))
  const spin = driven.reduce((s, i) => {
    const wd = w.get(me.data.wheels[i]).data
    return s - dot(sub(wd.spin, chassis.spin), turn(wd.rot, [0, 0, 1]))
  }, 0) / driven.length
  return { spin, driven }
}

// An electric motor through one fixed reduction, `ratio`. The row's `gear` is -1 reverse, 0 neutral
// and 1 drive. The motor turns with the driven wheels' mean forward spin times the ratio, `rpm`; up
// to the speed where `torque` (N·m) makes `power` (W) it pulls with `torque` times the throttle, and
// above it with `power` over its speed, falling as it spins up, and nothing at `redline` (its rpm
// limit). With the throttle shut it brakes the wheels by `regen` (N·m at the motor), as a motor run
// as a generator does. Throttle below 0 is the brake pedal. That torque through the ratio and
// `efficiency` is shared equally among the driven wheels' motors, each aimed at the wheel speed of
// the redline, or at rest while regenerating.
function electric(me: Row, e: Electric, cs: Corner[], w: W) {
  const pedal: number = me.data.throttle ?? 0, throttle = Math.max(0, pedal)
  const brake = Math.max(me.data.brake ?? 0, -pedal)
  const gear: number = Math.sign(me.data.gear ?? 0)
  const ratio = gear * e.ratio
  const { spin, driven } = drivenSpin(me, cs, w)
  const rpm = Math.min(Math.abs(spin * ratio) * RPM, e.redline)
  const omega = rpm / RPM
  const torque = throttle > 0
    ? (rpm < e.redline ? Math.min(e.torque, omega > 0 ? e.power / omega : e.torque) * throttle : 0)
    : -e.regen
  me.data.rpm = rpm
  me.data.torque = torque
  const share = (Math.abs(torque * ratio) * e.efficiency) / driven.length
  const aim = torque > 0 ? (-Math.sign(ratio) * (e.redline / RPM)) / Math.abs(ratio) : 0
  cs.forEach((c, i) => {
    const j = w.get(me.data.joints[i]).data
    if (brake > 0) { j.spinSpeed = 0; j.maxSpinTorque = brake * e.brakeTorque }
    else if (c.axle.driven && ratio !== 0) { j.spinSpeed = aim; j.maxSpinTorque = share }
    else { j.spinSpeed = 0; j.maxSpinTorque = 0 }
  })
}

function direct(me: Row, e: Direct, cs: Corner[], w: W) {
  const throttle: number = me.data.throttle ?? 0, brake: number = me.data.brake ?? 0
  cs.forEach((c, i) => {
    const j = w.get(me.data.joints[i]).data
    if (brake > 0) { j.spinSpeed = 0; j.maxSpinTorque = brake * e.brakeTorque }
    else if (c.axle.driven && throttle !== 0) { j.spinSpeed = -throttle * e.spinSpeed; j.maxSpinTorque = e.spinTorque }
    else { j.spinSpeed = 0; j.maxSpinTorque = e.coastTorque }
  })
}

// The engine's torque at full throttle at `rpm`, N·m: the curve's points joined by straight lines,
// its ends held past them.
export function torqueAt(curve: Petrol['curve'], rpm: number): number {
  if (rpm <= curve[0][0]) return curve[0][1]
  for (let i = 1; i < curve.length; i++) {
    const [r0, t0] = curve[i - 1], [r1, t1] = curve[i]
    if (rpm <= r1) return t0 + ((t1 - t0) * (rpm - r0)) / (r1 - r0)
  }
  return curve[curve.length - 1][1]
}

const RPM = 60 / (2 * Math.PI)

// A petrol engine through a gearbox. The row's `gear` is -1 reverse, 0 neutral, 1… the gears; `rpm`
// the engine's speed. With `automatic`, any forward gear is drive, and the box moves it each step
// before the engine turns (`choose`). Throttle below 0 is the brake pedal. In gear the engine turns
// with the driven wheels' mean forward spin times the gear's ratio times the final drive, the road's
// rpm. Below twice its floor (`launch` rpm at full throttle, `idle` at none, the redline at most) the
// clutch slips: the engine starts at the floor and climbs as the clutch bites, the floor plus the
// road's rpm times (1 − floor / twice the floor), so it meets the road's rpm at twice the floor and
// never sits on one rpm while the car gathers speed. In neutral it
// revs toward `idle` up to `redline` with the throttle, at most `revRate` rpm a second. Its torque is
// the curve's times the throttle, none at the redline (the limiter), and with the throttle shut it
// drags by `friction` (base + perThousand per 1000 rpm), the engine braking. That torque through the
// gear, the final drive and `efficiency` is shared equally among the driven wheels' motors, each
// aimed at the wheel speed of the redline in this gear, or at rest while braking by the engine, so
// a car left in gear stands where it stopped.
function petrol(me: Row, e: Petrol, cs: Corner[], w: W, dt: number) {
  const pedal: number = me.data.throttle ?? 0, throttle = Math.max(0, pedal)
  const brake = Math.max(me.data.brake ?? 0, -pedal)
  const { spin, driven } = drivenSpin(me, cs, w)
  let gear: number = me.data.gear ?? 0
  if (e.automatic && gear > 0) me.data.gear = gear = choose(e, e.automatic, gear, spin, throttle)
  const ratio = gear === 0 ? 0 : (gear < 0 ? -e.reverse : e.gears[gear - 1]) * e.final
  let rpm: number = me.data.rpm ?? e.idle
  if (ratio === 0) {
    const to = e.idle + throttle * (e.redline - e.idle), step = e.revRate * dt
    rpm += Math.max(-step, Math.min(step, to - rpm))
  } else {
    const road = spin * ratio * RPM, floor = e.idle + throttle * (e.launch - e.idle), lock = Math.min(e.redline, 2 * floor)
    rpm = road >= lock ? road : floor + Math.max(0, road) * (1 - floor / lock)
  }
  rpm = Math.min(rpm, e.redline)
  const drag = e.friction[0] + (e.friction[1] * rpm) / 1000
  const torque = throttle > 0 ? (rpm < e.redline ? torqueAt(e.curve, rpm) * throttle : 0) : -drag
  me.data.rpm = rpm
  me.data.torque = torque
  const share = (Math.abs(torque * ratio) * e.efficiency) / driven.length
  const aim = torque > 0 ? (-Math.sign(ratio) * (e.redline / RPM)) / Math.abs(ratio) : 0
  cs.forEach((c, i) => {
    const j = w.get(me.data.joints[i]).data
    if (brake > 0) { j.spinSpeed = 0; j.maxSpinTorque = brake * e.brakeTorque }
    else if (c.axle.driven && ratio !== 0) { j.spinSpeed = aim; j.maxSpinTorque = share }
    else { j.spinSpeed = 0; j.maxSpinTorque = 0 }
  })
}

// An automatic gearbox's forward gear for this step, one gear from `gear` at most. The rpm the driven
// wheels turn the engine at in a gear is their spin through it (the clutch's slip left out); the box
// shifts up once that reaches `up` and down once it falls to `down`, each the throttle's share of the
// way from its light-throttle rpm to its full-throttle one, so a car pressed hard holds a gear longer
// and a floored throttle kicks down. It shifts only where the gear it goes to would not shift straight
// back, which keeps it from hunting between two.
function choose(e: Petrol, a: NonNullable<Petrol['automatic']>, gear: number, spin: number, throttle: number): number {
  const at = (g: number) => spin * e.gears[g - 1] * e.final * RPM
  const up = a.up[0] + (a.up[1] - a.up[0]) * throttle, down = a.down[0] + (a.down[1] - a.down[0]) * throttle
  if (gear < e.gears.length && at(gear) >= up && at(gear + 1) > down) return gear + 1
  if (gear > 1 && at(gear) <= down && at(gear - 1) < up) return gear - 1
  return gear
}

/** Whether a car picks its own forward gear, so its driver only chooses reverse, neutral or drive:
 * an electric car's one reduction, or a petrol car's automatic gearbox. */
export function automatic(v: Vehicle): boolean {
  return 'power' in v.engine || ('curve' in v.engine && v.engine.automatic !== undefined)
}

/** How hard a car's row brakes, 0 to 1, and whether it drives backwards: its `brake`, or its
 * throttle below 0 where that is the brake pedal, a petrol or electric car's; backwards in reverse
 * gear, or with the throttle below 0 for a direct-drive car, which has no gear. */
export function pedals(v: Vehicle, car: Row): { brake: number; reverse: boolean } {
  const throttle: number = car.data.throttle ?? 0, brake: number = car.data.brake ?? 0
  if ('spinSpeed' in v.engine) return { brake, reverse: throttle < 0 }
  return { brake: Math.max(brake, -throttle), reverse: (car.data.gear ?? 0) < 0 }
}

/** Moves a car's gear `by` up or down, held between reverse and its top gear: a manual petrol car's
 * gearbox; an electric car's, or an automatic's, reverse, neutral and drive, any forward gear of an
 * automatic being drive. A direct-drive car has no gear. */
export function shift(me: Row, v: Vehicle, by: number) {
  const e = v.engine, gear: number = me.data.gear ?? 0
  if ('spinSpeed' in e) return
  if (automatic(v)) {
    if (gear > 0 && by > 0) return
    me.data.gear = Math.max(-1, Math.min(1, Math.min(gear, 1) + by))
    return
  }
  me.data.gear = Math.max(-1, Math.min((e as Petrol).gears.length, gear + by))
}

// Whether a part moves slower than Box3D's sleep threshold for it: its speed, and its spin times
// `far`, how far its shape reaches from its centre of mass, as Box3D reckons a body's: a wheel's
// radius, the chassis's farthest corner when left out.
function sleepy(v: Vehicle, part: Row, far = chassisExtent(v)): boolean {
  const d = part.data, threshold: number = v.bodies.sleepThreshold ?? b3.b3DefaultBodyDef().sleepThreshold
  return math.hypot(d.vel[0], d.vel[1], d.vel[2]) < threshold && far * math.hypot(d.spin[0], d.spin[1], d.spin[2]) < threshold
}

// How far the chassis's shape reaches from its centre of mass: its farthest corner, the box's or
// the cabin's where it has one.
function chassisExtent(v: Vehicle): number {
  const { length: l, height: h, width: wd, center, cabin } = v.body
  const box = [-1, 1].flatMap(a => [-1, 1].flatMap(b => [-1, 1].map(c => [(a * l) / 2, (b * h) / 2, (c * wd) / 2])))
  const hull = cabin ? cabinPoints(v, cabin) : [], points = [...box, ...Array.from({ length: hull.length / 3 }, (_, i) => hull.slice(3 * i, 3 * i + 3))]
  return Math.max(...points.map(p => math.hypot(p[0] - center[0], p[1] - center[1], p[2] - center[2])))
}

const push = (row: Row, p: Push) => { (row.data.pushes ??= []).push(p) }

// Each corner's suspension set for this step, its numbers written on the row; hands back what each
// corner's spring, bump stop and anti-roll bar push with, N, the damper left out.
function suspend(me: Row, v: Vehicle, w: W, dt: number): number[] {
  const body = w.get(me.data.chassis), c = body.data
  const up = turn(c.rot, [0, 1, 0]), com = add(c.pos, turn(c.rot, v.body.center))
  const g = pull(w)
  if (g === undefined) throw new Error('box3dvehicle: world.box3dvehicle.mods names no gravity, and a car\'s springs carry its weight in it: name the plugin its parts are bodies of, as { gravity: \'box3d\' }')
  const cs = corners(v), shares = loads(v, g)
  const at = cs.map((k, i) => {
    const wheel = w.get(me.data.wheels[i])
    const mount = add(c.pos, turn(c.rot, k.mount)), hub = add(wheel.data.pos, turn(wheel.data.rot, k.hub))
    const vMount = add(c.vel, cross(c.spin, sub(mount, com)))
    const vHub = add(wheel.data.vel, cross(wheel.data.spin, sub(hub, wheel.data.pos)))
    return {
      wheel, hub, mount,
      grounded: (wheel.data.touching?.length ?? 0) > 0,
      compression: dot(sub(hub, mount), up) + k.axle.spring.length,
      speed: dot(sub(vHub, vMount), up),
    }
  })
  // A car whose every part is slower than Box3D's sleep threshold keeps its joints as they are:
  // Box3D starts a body's time to sleep over whenever a joint on it is set, and a car at rest moves
  // by less than that each step, so it would never sleep. Its springs push as they were last set,
  // which is how they push at rest.
  const still = sleepy(v, body) && at.every((x, i) => sleepy(v, x.wheel, cs[i].axle.wheel.radius))
  const pressed: number[] = []
  const load = at.map((x, i) => {
    const k = cs[i], { spring, bumpStop, antiRoll, damper } = k.axle
    const cNow = x.compression, other = at[i ^ 1].compression
    const pushed = shares[i] + spring.stiffness * (cNow - spring.sag)
    const into = cNow - (spring.travel - bumpStop.length)
    const f = Math.max(0, pushed) + (into > 0 ? bumpStop.stiffness * into * (1 + into / bumpStop.length) : 0) + antiRoll * (cNow - other)
    pressed.push(Math.max(0, f))
    const stiff = (pushed > 0 ? spring.stiffness : 0) + (into > 0 ? bumpStop.stiffness * (1 + (2 * into) / bumpStop.length) : 0) + antiRoll
    const rate = x.speed > 0 ? damper.bump : damper.rebound, m = reach(v, k)
    const j = w.get(me.data.joints[i]).data
    if (still && j.enableSuspensionSpring !== undefined) return f + rate * x.speed
    if (stiff > 0) {
      const free = cNow - f / stiff
      j.enableSuspensionSpring = true
      j.localFrameA = frameA(k, free)
      j.lowerSuspensionLimit = -free
      j.upperSuspensionLimit = spring.travel - free
      j.suspensionHertz = Math.sqrt(stiff / m) / (2 * Math.PI)
      j.suspensionDampingRatio = rate / (2 * Math.sqrt(stiff * m))
    } else {
      j.enableSuspensionSpring = false
      j.localFrameA = frameA(k, 0)
      j.lowerSuspensionLimit = 0
      j.upperSuspensionLimit = spring.travel
      const impulse = m * x.speed * (1 - math.exp((-rate * dt) / m))
      push(body, { impulse: scale(up, impulse), point: x.mount })
      push(x.wheel, { impulse: scale(up, -impulse), point: x.hub })
    }
    return f + rate * x.speed
  })
  me.data.compression = at.map(x => x.compression)
  me.data.load = load
  me.data.grounded = at.map(x => x.grounded)
  return pressed
}

// What a `grip` mod is: how well the ground at [x, z] grips, a multiplier of a wheel's friction.
export type Grip = (w: W, x: number, z: number) => number

// Each wheel's friction, its `wheel.friction` times the square of the grip of the ground under it:
// Box3D mixes two shapes' friction as √(a·b), so the contact's is what it is on ungripping ground
// times the grip.
function grips(me: Row, v: Vehicle, w: W) {
  const grip = mod<Grip>(w.world, 'box3dvehicle', 'grip')
  if (!grip) return
  corners(v).forEach((c, i) => {
    const wheel = w.get(me.data.wheels[i]).data, g = grip(w, wheel.pos[0], wheel.pos[2])
    wheel.friction = c.axle.wheel.friction * g * g
  })
}

// What a `drag` mod is: the ground's rolling resistance at [x, z], newtons per newton of load.
export type Drag = (w: W, x: number, z: number) => number

// Each wheel on the ground pushed against the way it goes across it, level, by the ground's drag
// times what its corner's spring, bump stop and anti-roll bar push it down with (`pressed`, the
// corner's `load` without its damper, which pushes only while the wheel moves against the chassis
// and carries no weight), for one step: an impulse at the wheel's middle, at most the one that stops
// its share of the car, the chassis's mass over the wheels and its own, so it slows a car and never
// turns it round.
function drags(me: Row, v: Vehicle, w: W, dt: number, pressed: number[]) {
  const drag = mod<Drag>(w.world, 'box3dvehicle', 'drag')
  if (!drag) return
  const cs = corners(v), share = v.body.mass / cs.length
  cs.forEach((c, i) => {
    if (!me.data.grounded[i]) return
    const wheel = w.get(me.data.wheels[i]), [vx, , vz] = wheel.data.vel as Vec3, speed = math.hypot(vx, vz)
    const d = drag(w, wheel.data.pos[0], wheel.data.pos[2])
    // A wheel slower than Box3D's sleep threshold is left alone: a push wakes its body, and a car at
    // rest would never sleep.
    if (!(d > 0) || speed === 0 || sleepy(v, wheel, c.axle.wheel.radius)) return
    const impulse = Math.min(d * pressed[i] * dt, (share + c.axle.wheel.mass) * speed)
    push(wheel, { impulse: [(-vx / speed) * impulse, 0, (-vz / speed) * impulse] })
  })
}

/** A car of the fleet's `name` at `pos` turned `rot`, spawned with its parts made and its joints
 * driven. */
export function vehicle(w: W, name: string, pos: Vec3, rot: Quat): Row {
  const me = w.spawn('box3dvehicle', { vehicle: name, pos, rot })
  const v = design(w.world, me)
  build(me, v, w)
  drive(me, v, w, 0)
  return me
}

/** Ends a car and every part of it: its joints, its wheels, its chassis and its row. */
export function scrap(w: W, car: Row) {
  for (const id of [...(car.data.joints ?? []), ...(car.data.wheels ?? []), car.data.chassis]) if (id !== undefined) w.end(w.get(id))
  w.end(car)
}

// The pedal onto the throttle and the gear (Driving, above).
function press(me: Row, v: Vehicle, w: W) {
  const pedal: number = me.data.pedal
  if (!automatic(v)) { me.data.throttle = pedal; return }
  if (!v.pedal) throw new Error(`box3dvehicle: ${me.data.vehicle} is driven by its pedal and picks its own gear, and gives no pedal.stop: the m/s below which the pedal changes its way`)
  const chassis = w.get(me.data.chassis).data, f = turn(chassis.rot, [1, 0, 0])
  const along = chassis.vel[0] * f[0] + chassis.vel[1] * f[1] + chassis.vel[2] * f[2]
  const { stop } = v.pedal, gear: number = me.data.gear ?? 0
  if (pedal < 0 && gear >= 0 && along < stop) me.data.gear = -1
  else if (pedal > 0 && gear <= 0 && along > -stop) me.data.gear = 1
  me.data.throttle = me.data.gear < 0 ? -pedal : pedal
}

// The nearest point of the chassis's box to a point in the world, and the way from it to the point,
// the box `half` extents about `pos` turned `rot`.
function nearest(pos: Vec3, rot: Quat, half: Vec3, p: Vec3): { at: Vec3; gap: number } {
  const back: Quat = [-rot[0], -rot[1], -rot[2], rot[3]]
  const local = turn(back, sub(p, pos))
  const held: Vec3 = [clamp(local[0], -half[0], half[0]), clamp(local[1], -half[1], half[1]), clamp(local[2], -half[2], half[2])]
  const gap = math.hypot(local[0] - held[0], local[1] - held[1], local[2] - held[2])
  return { at: add(pos, turn(rot, held)), gap }
}

// The point of the segment a–b nearest the box and how far it is from it. The distance from a box
// to a point moving along a segment is convex in how far along it is, so a golden-section search
// narrows on its least.
function closest(pos: Vec3, rot: Quat, half: Vec3, a: Vec3, b: Vec3): { on: Vec3; at: Vec3; gap: number } {
  const along = (t: number): Vec3 => add(a, scale(sub(b, a), t))
  const gapAt = (t: number) => nearest(pos, rot, half, along(t)).gap
  const k = (Math.sqrt(5) - 1) / 2
  let lo = 0, hi = 1
  let x1 = hi - k * (hi - lo), x2 = lo + k * (hi - lo), f1 = gapAt(x1), f2 = gapAt(x2)
  for (let i = 0; i < 40; i++) {
    if (f1 < f2) { hi = x2; x2 = x1; f2 = f1; x1 = hi - k * (hi - lo); f1 = gapAt(x1) }
    else { lo = x1; x1 = x2; f1 = f2; x2 = lo + k * (hi - lo); f2 = gapAt(x2) }
  }
  const best = [0, 1, (lo + hi) / 2].map(t => ({ t, ...nearest(pos, rot, half, along(t)) })).reduce((p, q) => (q.gap < p.gap ? q : p))
  return { on: along(best.t), at: best.at, gap: best.gap }
}

// The car hits the bodies its chassis meets (`world.box3dvehicle.hit`): every body hitscan3d's
// `bodies` mod hands whose shape the chassis's box reaches, while the chassis moves toward it at
// `hit.speed` m/s or faster, is struck once, through the `strike` mod, on the part met nearest the
// box, `what: 'car'`: `damage` `hit.damage` for each m/s, `by` the chassis, `point` where on the body
// the box met it, `dir` the way the chassis moves, and `speed` its speed. A cylinder is met as the segment up its
// middle, its `radius` round it.
function hits(me: Row, v: Vehicle, w: W) {
  const fleet: Fleet = w.world.box3dvehicle
  const bodies = mod<Bodies>(w.world, 'box3dvehicle', 'bodies')
  const strike = mod<Strike>(w.world, 'box3dvehicle', 'strike')
  if (!bodies || !strike || !fleet.hit) return
  const chassis = w.get(me.data.chassis)
  const { pos, rot, vel } = chassis.data as { pos: Vec3; rot: Quat; vel: Vec3 }
  const speed = math.hypot(vel[0], vel[1], vel[2])
  if (speed < fleet.hit.speed) return
  const half: Vec3 = [v.body.length / 2, v.body.height / 2, v.body.width / 2]
  const dir = scale(vel, 1 / speed)
  for (const body of bodies(w)) {
    let met: { part: string; on: Vec3; at: Vec3; gap: number } | undefined
    for (const s of body.shapes) {
      const [a, b, radius]: [Vec3, Vec3, number] = 'capsule' in s
        ? [s.capsule.a as Vec3, s.capsule.b as Vec3, s.capsule.radius]
        : [s.cylinder.pos as Vec3, add(s.cylinder.pos as Vec3, [0, s.cylinder.height, 0]), s.cylinder.radius]
      const c = closest(pos, rot, half, a, b)
      if (c.gap > radius) continue
      if (!met || c.gap < met.gap) met = { part: s.part, ...c }
    }
    if (!met) continue
    // Only a chassis moving toward the body hits it: one backing away from it, or one the body
    // stands inside of, does not.
    if (met.gap > 0 && dot(vel, sub(met.on, met.at)) <= 0) continue
    strike(w, w.get(body.id), { damage: fleet.hit.damage * speed, by: chassis.id, part: met.part, point: met.on, dir, what: 'car', speed })
  }
}

const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))

export const box3dvehicle: Kind = {
  before(me, dt, w) {
    const v = design(w.world, me)
    if (me.data.chassis === undefined) build(me, v, w)
    if (typeof me.data.pedal === 'number') press(me, v, w)
    drive(me, v, w, dt)
    const pressed = suspend(me, v, w, dt)
    grips(me, v, w)
    drags(me, v, w, dt, pressed)
    hits(me, v, w)
  },
  acts: {
    pedal(me, _w, _seat, v: unknown) {
      if (finite(v)) me.data.pedal = clamp(v, -1, 1)
    },
    throttle(me, _w, _seat, v: unknown) {
      if (!finite(v)) return
      me.data.pedal = null
      me.data.throttle = clamp(v, -1, 1)
    },
    steer(me, _w, _seat, v: unknown) {
      if (finite(v)) me.data.steer = clamp(v, -1, 1)
    },
    brake(me, _w, _seat, v: unknown) {
      if (finite(v)) me.data.brake = clamp(v, 0, 1)
    },
    shift(me, w, _seat, by: unknown) {
      if (by === 1 || by === -1) shift(me, design(w.world, me), by)
    },
  },
}
