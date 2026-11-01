// box3dvehicle on flat box3d ground, whose top is y = 0. The test writes its own scenes: a manager
// and one child, a yard, which `load` boots as a game's would, so box3d is handed the car's kinds by
// box3dvehicle's mod, and box3dvehicle box3d's gravity by box3d's (`world.box3dvehicle.mods.gravity`).
// The car is a 3.6 m body of 600 kg with a cabin on it, on two axles 2.5 m apart, each wheel 20 kg,
// all four driven, the front two steered; a test changes what it holds the car to: steered on its
// rear axle, or with no cabin. A write the test makes to the car's row between steps is what a rule
// would write.
//
// Every number a test holds the suspension to is worked out apart from Box3D: a wheel's share of the
// weight from the lever rule, a bounce's fall from one swing to the next from its damping ratio.
import { afterAll, expect, test } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { boot, type Scene, type Truth, type W } from '#engine/engine.ts'
import { load } from '#addons/scenemanager/scenemanager.addon.ts'
import { scenemanager } from '#plugins/scenemanager/scenemanager.sim.ts'
import type { Static } from '#plugins/box3d/box3d.sim.ts'
import { box3dvehicle, corners, loads, pedals, shift, turn, type Axle, type Fleet, type Vehicle } from './box3dvehicle.sim.ts'
import { kinds } from './box3dvehicle.box3d.ts'

const DT = 1 / 60
const G = 10
const surface = { friction: 0.9, restitution: 0, rollingResistance: 0 }
const flat: Static = { pos: [0, -1, 0], rot: [0, 0, 0, 1], shapes: [{ box: [2000, 1, 200],baseMaterial: surface }] }

const axle = (at: number, steered: boolean): Axle => ({
  at, track: 1.7, mount: 0.2,
  wheel: { radius: 0.36, width: 0.28, mass: 20, friction: 0.9, rollingResistance: 0 },
  spring: { stiffness: 16000, length: 0.55, travel: 0.3, sag: 0.1 },
  damper: { bump: 800, rebound: 1600 },
  bumpStop: { length: 0.06, stiffness: 30000 },
  antiRoll: 8000, driven: true, steered,
})
const vehicle: Vehicle = {
  body: { length: 3.6, width: 1.3, height: 0.5, mass: 600, center: [0.1, -0.1, 0], friction: 0.9, cabin: { at: -0.2, length: 1.9, width: 1.2, top: 1.2, topWidth: 1, height: 0.5 } },
  bodies: { enableContactRecycling: false },
  axles: [axle(1.25, true), axle(-1.25, false)],
  engine: { spinSpeed: 30, spinTorque: 300, brakeTorque: 600, coastTorque: 0 },
  steering: { angle: 0.5, hertz: 5, dampingRatio: 1, maxTorque: 1e4 },
  look: { paint: { body: 0, cabin: 0, trim: 0, glass: 0, light: 0, tail: 0, amber: 0, tyre: 0, rim: 0, chrome: 0, seat: 0, hook: 0, spring: 0, damper: 0, arm: 0 }, segments: 16, spokes: 5, rim: 0.6, coils: 6, coilRadius: 0.07, wire: 0.01, arm: 0.03 },
}
// The scene's fleet: the one vehicle a yard makes, `car`, its parts of the kinds `body`, `tyre` and
// `axle`, in box3d's gravity unless `mods` says otherwise.
const fleet = (v: Vehicle, mods: Fleet['mods'] = { gravity: 'box3d' }): Fleet => ({ chassis: 'body', wheel: 'tyre', joint: 'axle', vehicles: { car: v }, mods })
// The same car with every axle's numbers changed as `over` says.
const axles = (over: (a: Axle) => Partial<Axle>, v = vehicle): Vehicle => ({ ...v, axles: v.axles.map(a => ({ ...a, ...over(a) })) })

const dir = mkdtempSync(join(tmpdir(), 'box3dvehicle-'))
afterAll(() => rmSync(dir, { recursive: true }))
const path = (p: string) => JSON.stringify(new URL(p, import.meta.url).pathname)
let made = 0

// A yard with one car made at height `y` on flat ground, falling `g` m/s², booted and loaded: its
// truth, and its `w` as the last step left it.
async function yard(v: Vehicle = vehicle, y = 1, flip = false, g = G, mods?: Fleet['mods'], ground: Static = flat): Promise<{ truth: Truth; w: () => W }> {
  const name = `yard${made++}`
  const at = { pos: [0, 0, 0], rot: [0, 0, 0, 1], vel: [0, 0, 0], spin: [0, 0, 0], awake: true }
  const actors = [{ is: 'box3d' }, { is: 'box3dvehicle', vehicle: 'car', pos: [0, y, 0], rot: [0, 0, 0, 1] }]
  const scene = {
    world: { box3d: { gravity: [0, -g, 0], subStepCount: 4, static: [ground], kinds: {}, mods: { kinds: 'box3dvehicle' } }, box3dvehicle: fleet(v, mods) },
    prefabs: { engine: { dt: DT }, scenemanager: { out: {} }, box3d: {}, box3dvehicle: { throttle: 0, brake: 0, steer: 0 }, body: at, tyre: at, axle: {}, probe: {} },
    actors: [{ is: 'scenemanager' }, ...(flip ? actors.reverse() : actors), { is: 'probe' }],
    plugins: ['scenemanager'],
  }
  writeFileSync(join(dir, `${name}.scene.json`), JSON.stringify(scene))
  writeFileSync(join(dir, `${name}.sim.ts`), `
import { scenemanager } from ${path('../scenemanager/scenemanager.sim.ts')}
import { box3d } from ${path('../box3d/box3d.sim.ts')}
import { box3dvehicle } from ${path('./box3dvehicle.sim.ts')}
import file from './${name}.scene.json' with { type: 'json' }
export const sim = { scenemanager, box3d, box3dvehicle, body: {}, tyre: {}, axle: {}, probe: { after(_me, _dt, w) { globalThis.${name} = w } } }
export const scene = file
`)
  const top: Scene = {
    prefabs: { engine: { dt: DT }, scenemanager: { scenes: { [name]: { file: `${name}.scene.json`, suspend: false } }, dt: DT, entry: name, port: 0 } },
    actors: [{ is: 'scenemanager' }],
    plugins: ['scenemanager'],
  }
  const truth = (await load(boot(top, { scenemanager }), pathToFileURL(dir + '/').href)).get(name)!
  return { truth, w: () => (globalThis as any)[name] }
}

const run = (truth: Truth, k: number) => { for (let i = 0; i < k; i++) truth.step(DT) }
const car = (truth: Truth) => truth.rows.find(r => r.kind === 'box3dvehicle')!
const part = (truth: Truth, id: number) => truth.rows.find(r => r.id === id)!.data
const chassis = (truth: Truth) => part(truth, car(truth).data.chassis)
const heading = (truth: Truth) => turn(chassis(truth).rot, [1, 0, 0])
// The heading's angle about up, positive to the left (-z).
const yaw = (truth: Truth) => { const h = heading(truth); return Math.atan2(-h[2], h[0]) }
const speed = (truth: Truth) => Math.hypot(...(chassis(truth).vel as number[]))
// How far the chassis leans to its right, radians: its up turned towards +z.
const lean = (truth: Truth) => Math.asin(turn(chassis(truth).rot, [0, 1, 0])[2])
const settled = async (v = vehicle, flip = false) => { const y = await yard(v, 1, flip); run(y.truth, 120); return y }

test('the car is made of box3d rows at its pos, the row keeps only what changes, and it reports each corner', async () => {
  const { truth } = await yard()
  run(truth, 2)
  const d = car(truth).data
  expect(d.wheels).toHaveLength(4)
  expect(d.joints).toHaveLength(4)
  expect('pos' in d || 'rot' in d).toBe(false)
  expect(truth.rows.filter(r => r.kind === 'tyre')).toHaveLength(4)
  for (const f of ['compression', 'load', 'grounded']) expect(d[f]).toHaveLength(4)
})

test('standing on flat ground, each spring is pushed in its sag and carries its lever-rule share of the weight', async () => {
  const { truth } = await settled()
  run(truth, 180)
  const d = car(truth).data
  // Front axle 1.25 m ahead, rear 1.25 m behind, the centre of mass 0.1 m ahead: the front carries
  // (1.25 + 0.1) / 2.5 of the 6000 N, the rear the rest, each split between its two wheels.
  const shares = [1.35, 1.35, 1.15, 1.15].map(l => (600 * G * l) / 2.5 / 2)
  expect(loads(vehicle, G).map(x => Math.round(x))).toEqual(shares.map(x => Math.round(x)))
  d.compression.forEach((c: number) => expect(Math.abs(c - 0.1)).toBeLessThan(0.005))
  d.load.forEach((f: number, i: number) => expect(Math.abs(f - shares[i]) / shares[i]).toBeLessThan(0.03))
  expect(d.grounded).toEqual([true, true, true, true])
})

test('in a quarter of the gravity, box3d\'s as its mod hands it, each spring is still pushed in its sag and carries a quarter of the weight', async () => {
  // Preloaded against 10 m/s² in a 2.5 m/s² world, each front spring would push the car up off its
  // sag, to 0.1 − (1620 − 405) / 16000 = 0.024 m, and report 1215 N more than its share. So little
  // weight settles slowly enough that Box3D would put the car to sleep short of its rest, so it is
  // kept awake. Each spring rests within 3 mm of its sag, which is 48 N of its stiffness.
  const g = G / 4, v = { ...vehicle, bodies: { ...vehicle.bodies, enableSleep: false } }
  const { truth } = await yard(v, 1, false, g)
  run(truth, 300)
  const d = car(truth).data, shares = loads(v, g)
  expect(shares.map(x => Math.round(x))).toEqual([405, 405, 345, 345])
  d.compression.forEach((c: number) => expect(Math.abs(c - 0.1)).toBeLessThan(0.003))
  d.load.forEach((f: number, i: number) => expect(Math.abs(f - shares[i])).toBeLessThan(48))
})

test('a car in a scene that names no gravity throws on its first step, saying so', async () => {
  const { truth } = await yard(vehicle, 1, false, G, {})
  expect(() => truth.step(DT)).toThrow('box3dvehicle: world.box3dvehicle.mods names no gravity, and a car\'s springs carry its weight in it: name the plugin its parts are bodies of, as { gravity: \'box3d\' }')
})

test('a heave bounce falls from one swing to the next as the damping ratio says', async () => {
  // Dampers equal both ways, 0.2 of critical on the front's corner mass, the car held level by
  // putting its centre of mass midway, so it bounces straight up and down; dropped 0.15 m.
  const k = 16000, corner = (600 * G) / 4 / G, zeta = 0.2, c = zeta * 2 * Math.sqrt(k * corner)
  const v = axles(() => ({ damper: { bump: c, rebound: c }, antiRoll: 0, bumpStop: { length: 0.06, stiffness: 0 } }), { ...vehicle, body: { ...vehicle.body, center: [0, -0.1, 0] } })
  const { truth } = await yard(v, 1.15)
  const ys: number[] = []
  for (let i = 0; i < 240; i++) { truth.step(DT); ys.push(chassis(truth).pos[1]) }
  const rest = ys.at(-1)!
  // The swings about rest after the first landing: each peak's distance from rest.
  const peaks: number[] = []
  for (let i = 20; i < ys.length - 1; i++) {
    const a = ys[i] - rest
    if (Math.abs(a) >= Math.abs(ys[i - 1] - rest) && Math.abs(a) > Math.abs(ys[i + 1] - rest) && Math.sign(a) !== Math.sign(peaks.at(-1) ?? -a)) peaks.push(a)
  }
  // Half a swing apart, a damped bounce falls by e^(−πζ/√(1−ζ²)). That is the chassis alone on its
  // springs; the tyres' give on the ground, which Box3D damps too, and its solver take out a little
  // more, as much as 0.05 more of critical, and never less.
  const fall = (z: number) => Math.exp((-Math.PI * z) / Math.sqrt(1 - z * z))
  expect(peaks.length).toBeGreaterThanOrEqual(3)
  for (let i = 1; i < 3; i++) {
    const r = Math.abs(peaks[i] / peaks[i - 1])
    expect(r).toBeLessThan(fall(zeta) * 1.02)
    expect(r).toBeGreaterThan(fall(zeta + 0.05))
  }
})

test('with rebound damping above bump, a dropped car goes in deeper and comes back out slower than with them swapped', async () => {
  const drop = async (bump: number, rebound: number) => {
    const { truth } = await yard(axles(() => ({ damper: { bump, rebound } })), 1.2)
    const cs: number[] = []
    for (let i = 0; i < 120; i++) { truth.step(DT); cs.push(car(truth).data.compression[0]) }
    const deepest = Math.max(...cs), at = cs.indexOf(deepest)
    return { deepest, back: cs.slice(at).findIndex(c => c < 0.1) }
  }
  const soft = await drop(600, 2400), hard = await drop(2400, 600)
  expect(soft.deepest).toBeGreaterThan(hard.deepest + 0.01)
  expect(soft.back).toBeGreaterThan(hard.back)
})

test('an anti-roll bar makes the car lean less in a steady turn', async () => {
  const turned = async (antiRoll: number) => {
    const { truth } = await settled(axles(() => ({ antiRoll })))
    Object.assign(car(truth).data, { throttle: 1, steer: 0.6 })
    run(truth, 150)
    let sum = 0
    for (let i = 0; i < 60; i++) { truth.step(DT); sum += lean(truth) }
    return Math.abs(sum / 60)
  }
  const without = await turned(0), barred = await turned(20000)
  expect(without).toBeGreaterThan(0.01)
  expect(barred).toBeLessThan(without * 0.8)
})

test('the bump stop catches a car dropped 0.8 m before the wheel reaches the end of its travel', async () => {
  // At rest the chassis's origin is a wheel's radius, the spring's length less its sag, and less the
  // mount's height above the ground: 0.36 + 0.55 − 0.1 − 0.2 = 0.61 m. Made at 1.4 m, it falls 0.79 m.
  const deepest = async (stiffness: number) => {
    const { truth } = await yard(axles(() => ({ bumpStop: { length: 0.06, stiffness } })), 1.4)
    let most = 0
    for (let i = 0; i < 120; i++) { truth.step(DT); most = Math.max(most, ...car(truth).data.compression) }
    return most
  }
  expect(await deepest(0)).toBeGreaterThan(0.298)
  expect(await deepest(60000)).toBeLessThan(0.29)
})

test('throttle 1 for 60 steps moves the car more than 1 m forward along its heading', async () => {
  const { truth } = await settled()
  const start = [...chassis(truth).pos], h = heading(truth)
  car(truth).data.throttle = 1
  run(truth, 60)
  const moved = chassis(truth).pos.map((c: number, k: number) => c - start[k])
  expect(moved[0] * h[0] + moved[1] * h[1] + moved[2] * h[2]).toBeGreaterThan(1)
})

test('steer 1 with throttle turns the heading one way, and steer -1 the other', async () => {
  const turned = async (steer: number) => {
    const { truth } = await settled()
    const y0 = yaw(truth)
    Object.assign(car(truth).data, { throttle: 1, steer })
    run(truth, 90)
    return yaw(truth) - y0
  }
  expect(await turned(1)).toBeGreaterThan(0.1)
  expect(await turned(-1)).toBeLessThan(-0.1)
})

test('a car steered on its rear axle, behind the wheelbase\'s middle, turns left on a positive steer, as one steered on its front axle beside it does', async () => {
  const turned = async (v: Vehicle) => {
    const { truth } = await settled(v)
    const y0 = yaw(truth)
    Object.assign(car(truth).data, { throttle: 1, steer: 0.5 })
    run(truth, 90)
    return yaw(truth) - y0
  }
  const ats = vehicle.axles.map(a => a.at), mid = (Math.max(...ats) + Math.min(...ats)) / 2
  const rear = axles(a => ({ steered: a.at < mid }))
  // Its heading grows, to the left, as the front-steered car's does.
  expect(await turned(rear)).toBeGreaterThan(0.1)
  expect(await turned(vehicle)).toBeGreaterThan(0.1)
})

test('a car with no cabin is its body\'s box alone, the one shape box3d makes its chassis of, and it drives', async () => {
  const { cabin: _, ...body } = vehicle.body
  const bare: Vehicle = { ...vehicle, body }
  const { truth, w } = await yard(bare)
  run(truth, 120)
  const made = truth.rows.find(r => r.id === car(truth).data.chassis)!
  expect(kinds(w()).bodies!.body(made).shapes).toEqual([{ box: [body.length / 2, body.height / 2, body.width / 2], baseMaterial: { friction: body.friction } }])
  const start = [...chassis(truth).pos], h = heading(truth)
  car(truth).data.throttle = 1
  run(truth, 60)
  const moved = chassis(truth).pos.map((c: number, k: number) => c - start[k])
  expect(moved[0] * h[0] + moved[1] * h[1] + moved[2] * h[2]).toBeGreaterThan(1)
  expect(turn(chassis(truth).rot, [0, 1, 0])[1]).toBeGreaterThan(0.9)
})

test('brake 1 after driving makes the speed 30 steps later lower than when it was pressed', async () => {
  const { truth } = await settled()
  car(truth).data.throttle = 1
  run(truth, 90)
  const before = speed(truth)
  Object.assign(car(truth).data, { throttle: 0, brake: 1 })
  run(truth, 30)
  expect(speed(truth)).toBeLessThan(before)
})

test('pedals: a direct-drive car brakes by its brake and goes backwards on a throttle below 0; a geared car also brakes on a throttle below 0, and goes backwards in reverse gear', () => {
  const row = (data: Record<string, number>) => ({ id: 1, kind: 'box3dvehicle', data })
  expect(pedals(vehicle, row({ throttle: -1 }))).toEqual({ brake: 0, reverse: true })
  expect(pedals(vehicle, row({ throttle: 1, brake: 0.4 }))).toEqual({ brake: 0.4, reverse: false })
  const geared: Vehicle = { ...vehicle, engine: { torque: 200, power: 50000, redline: 9000, ratio: 9, efficiency: 0.9, regen: 5, brakeTorque: 600 } }
  expect(pedals(geared, row({ throttle: -0.6, gear: 1 }))).toEqual({ brake: 0.6, reverse: false })
  expect(pedals(geared, row({ throttle: 1, gear: -1, brake: 0.2 }))).toEqual({ brake: 0.2, reverse: true })
  expect(pedals(geared, row({}))).toEqual({ brake: 0, reverse: false })
})

// The car with a petrol engine of four gears through an automatic gearbox.
const automaticCar: Vehicle = {
  ...vehicle,
  engine: {
    curve: [[800, 90], [3500, 120], [6500, 80]], idle: 850, launch: 2200, redline: 6500, revRate: 9000, friction: [8, 3],
    gears: [3.6, 2.4, 1.7, 1.3], reverse: 3.4, final: 4.5, efficiency: 0.9, brakeTorque: 600,
    automatic: { up: [2500, 6000], down: [1300, 3500] },
  },
}

test('an automatic shifts up one gear at a time as it speeds up, never past its full-throttle shift point, and back down to first as it brakes to a stop', async () => {
  const { truth } = await settled(automaticCar)
  Object.assign(car(truth).data, { gear: 1, throttle: 1 })
  const gears = [1]
  for (let i = 0; i < 60 * 12; i++) {
    truth.step(DT)
    const g = car(truth).data.gear
    if (g !== gears.at(-1)) { expect(Math.abs(g - gears.at(-1)!)).toBe(1); gears.push(g) }
  }
  expect(gears).toEqual([1, 2, 3, 4])
  Object.assign(car(truth).data, { throttle: 0, brake: 1 })
  for (let i = 0; i < 60 * 10 && forward(truth) > 0.1; i++) truth.step(DT)
  run(truth, 2)
  expect(car(truth).data.gear).toBe(1)
}, 30_000)

test('pulling away at full throttle the engine starts at its launch rpm and climbs every step as the clutch bites, never held on one rpm', async () => {
  const { truth } = await settled(automaticCar)
  Object.assign(car(truth).data, { gear: 1, throttle: 1 })
  const rpms: number[] = []
  for (let i = 0; i < 30; i++) { truth.step(DT); rpms.push(car(truth).data.rpm) }
  expect(rpms[0]).toBeGreaterThanOrEqual(2200)
  expect(rpms[0]).toBeLessThan(2400)
  rpms.slice(1).forEach((r, i) => expect(r, `step ${i + 1}: ${rpms.map(Math.round).join(' ')}`).toBeGreaterThan(rpms[i]))
}, 30_000)

// ---------------------------------------------------------------- driving through the acts
// A rule reaches a car's acts with `w.call`, as a `player` row passes a seat's press on to the car it
// holds (`relay` in `plugins/player`); none is open, so no seat sends one at the car itself.

const call = (y: { truth: Truth; w: () => W }, action: string, ...args: unknown[]) => y.w().call(car(y.truth), action, -1, ...(args as any[]))
const pedalled: Vehicle = { ...automaticCar, pedal: { stop: 0.5 } }

test('the acts keep each control to its range, take only a finite number, and none is open to a seat', async () => {
  const y = await settled(pedalled)
  const d = () => car(y.truth).data
  call(y, 'pedal', 5)
  expect(d().pedal).toBe(1)
  call(y, 'pedal', NaN)
  call(y, 'pedal', '1')
  expect(d().pedal).toBe(1)
  call(y, 'steer', -3)
  expect(d().steer).toBe(-1)
  call(y, 'brake', 2)
  expect(d().brake).toBe(1)
  call(y, 'brake', -1)
  expect(d().brake).toBe(0)
  call(y, 'throttle', Infinity)
  expect(d().pedal).toBe(1)
  call(y, 'throttle', 0.5)
  expect(d().throttle).toBe(0.5)
  expect(d().pedal).toBeNull()
  d().gear = 1
  call(y, 'shift', 2)
  call(y, 'shift', 0.5)
  expect(d().gear).toBe(1)
  call(y, 'shift', -1)
  expect(d().gear).toBe(0)
  expect(box3dvehicle.open).toBeUndefined()
})

test('the pedal held back from a stop puts an automatic in reverse and drives it backwards, and pushed forward brakes it, puts it back in drive and drives it forwards', async () => {
  const y = await settled(pedalled)
  call(y, 'pedal', -1)
  run(y.truth, 120)
  expect(car(y.truth).data.gear).toBe(-1)
  expect(car(y.truth).data.throttle).toBe(1)
  expect(forward(y.truth)).toBeLessThan(-1)
  call(y, 'pedal', 1)
  run(y.truth, 1)
  expect(car(y.truth).data.gear).toBe(-1)
  expect(car(y.truth).data.throttle).toBe(-1)
  for (let i = 0; i < 600 && car(y.truth).data.gear < 0; i++) run(y.truth, 1)
  expect(car(y.truth).data.gear).toBe(1)
  run(y.truth, 120)
  expect(forward(y.truth)).toBeGreaterThan(1)
}, 30_000)

test('an automatic driven by its pedal with no pedal.stop throws on the step, saying so', async () => {
  const y = await settled(automaticCar)
  call(y, 'pedal', -1)
  expect(() => run(y.truth, 1)).toThrow('box3dvehicle: car is driven by its pedal and picks its own gear, and gives no pedal.stop')
})

test('a car that does not pick its gear takes the pedal as its throttle, backwards too', async () => {
  const y = await settled()
  call(y, 'pedal', -1)
  run(y.truth, 60)
  expect(car(y.truth).data.throttle).toBe(-1)
  expect(forward(y.truth)).toBeLessThan(-0.5)
})

test('shift on an automatic moves between reverse, neutral and drive, and leaves the gear drive is in', () => {
  const row = { id: 1, kind: 'box3dvehicle', data: { gear: 3 } }
  shift(row, automaticCar, 1)
  expect(row.data.gear).toBe(3)
  for (const [by, to] of [[-1, 0], [-1, -1], [-1, -1], [1, 0], [1, 1], [1, 1]]) { shift(row, automaticCar, by); expect(row.data.gear).toBe(to) }
})

test('the car\'s rows agree to 0.5 m whichever of box3d and box3dvehicle the actors list first', async () => {
  const drive = async (flip: boolean) => {
    const { truth } = await settled(vehicle, flip)
    Object.assign(car(truth).data, { throttle: 1, steer: 0.5 })
    run(truth, 60)
    return chassis(truth).pos
  }
  const a = await drive(false), b = await drive(true)
  expect(Math.hypot(...a.map((c: number, k: number) => c - b[k]))).toBeLessThan(0.5)
})

test('the car stays on its wheels for 300 steps of throttle and full steering', async () => {
  const { truth } = await settled()
  Object.assign(car(truth).data, { throttle: 1, steer: 1 })
  for (let i = 0; i < 300; i++) {
    truth.step(DT)
    expect(turn(chassis(truth).rot, [0, 1, 0])[1]).toBeGreaterThan(0)
  }
})

test('coastTorque: let off the throttle, a car with it slows more in 30 steps than one rolling free', async () => {
  // Four wheels held at 60 N·m each, 0.36 m round, slow 680 kg by 4 · 60 / 0.36 / 680 = 0.98 m/s²,
  // 0.49 m/s in half a second; the tyres slip some of it away, so most of it is asked for.
  const coast = async (coastTorque: number) => {
    const { truth } = await settled({ ...vehicle, engine: { ...vehicle.engine, coastTorque } })
    car(truth).data.throttle = 1
    run(truth, 90)
    const before = speed(truth)
    car(truth).data.throttle = 0
    run(truth, 30)
    return before - speed(truth)
  }
  expect(await coast(60)).toBeGreaterThan((await coast(0)) + 0.35)
})

test('a car left standing goes to sleep, every part of it, and stays where it stopped', async () => {
  const { truth } = await settled()
  run(truth, 120)
  const parts = [car(truth).data.chassis, ...car(truth).data.wheels]
  const at = [...chassis(truth).pos]
  run(truth, 120)
  for (const id of parts) expect(part(truth, id).awake).toBe(false)
  expect(Math.hypot(...chassis(truth).pos.map((c: number, k: number) => c - at[k]))).toBeLessThan(0.001)
})

// ---------------------------------------------------------------- power to the ground
//
// Each test below changes one thing and measures what Box3D makes of it. Box3D grips a wheel by
// Coulomb friction: the most a tyre can push is its contact's friction times the load on it, the
// contact's friction √(tyre · ground) (Box3D's mix), whatever the tyre's width.

// The speed along the car's heading.
const forward = (truth: Truth) => { const h = heading(truth), v = chassis(truth).vel; return v[0] * h[0] + v[1] * h[1] + v[2] * h[2] }
// The yard's ground friction: √(tyre · ground) is a contact's friction.
const mixed = (tyre: number) => Math.sqrt(tyre * surface.friction)

// A car whose wheels are each driven far harder than any tyre grips, so every wheel spins: how fast
// it gathers speed over a second from rest is what its tyres grip, m/s².
async function spun(over: (a: Axle) => Partial<Axle>): Promise<number> {
  const v = axles(over, { ...vehicle, engine: { spinSpeed: 200, spinTorque: 5000, brakeTorque: 600, coastTorque: 0 } })
  const { truth } = await settled(v)
  car(truth).data.throttle = 1
  run(truth, 30)
  const from = forward(truth)
  run(truth, 60)
  return forward(truth) - from
}

test('a spinning tyre pushes as hard as Coulomb friction lets it: the contact\'s friction times g', async () => {
  // Wheels and chassis 680 kg on four spinning tyres: the push is μ · 680 · g, so it gathers μ · g.
  for (const friction of [0.5, 0.9, 1.3]) {
    const a = await spun(x => ({ wheel: { ...x.wheel, friction } }))
    expect(Math.abs(a - mixed(friction) * G) / (mixed(friction) * G)).toBeLessThan(0.1)
  }
})

test('a tyre three times as wide grips no harder: Box3D rolls every wheel as a ball of its radius', async () => {
  // The contact is the same ball's, so the push is the same μ · load. The wider wheel is heavier to
  // turn about its other axes and hangs further from its joint, which costs it a little (8.8 against
  // 8.2 m/s²): width buys nothing in grip.
  const narrow = await spun(x => ({ wheel: { ...x.wheel, width: 0.2 } }))
  const wide = await spun(x => ({ wheel: { ...x.wheel, width: 0.6 } }))
  expect(wide).toBeLessThanOrEqual(narrow)
  expect(wide).toBeGreaterThan(narrow * 0.9)
})

test('rolling resistance slows a car rolling free: a tyre with it loses more speed coasting', async () => {
  const coast = async (rollingResistance: number) => {
    const { truth } = await settled(axles(x => ({ wheel: { ...x.wheel, rollingResistance } })))
    car(truth).data.throttle = 1
    run(truth, 120)
    car(truth).data.throttle = 0
    const from = forward(truth)
    run(truth, 120)
    return from - forward(truth)
  }
  const free = await coast(0), dragged = await coast(0.05)
  expect(free).toBeLessThan(0.2)
  expect(dragged).toBeGreaterThan(free + 0.5)
})

test('each wheel sits under its mount, at its axle and half the track out', async () => {
  const { truth } = await settled()
  const c = chassis(truth)
  corners(vehicle).forEach((k, i) => {
    const pos = part(truth, car(truth).data.wheels[i]).pos
    const inv = [-c.rot[0], -c.rot[1], -c.rot[2], c.rot[3]] as [number, number, number, number]
    const local = turn(inv, [pos[0] - c.pos[0], pos[1] - c.pos[1], pos[2] - c.pos[2]])
    expect(local[0]).toBeCloseTo(k.mount[0], 2)
    expect(local[2]).toBeCloseTo((k.side * k.axle.track) / 2, 2)
    expect(local[1]).toBeLessThan(k.mount[1])
  })
})
