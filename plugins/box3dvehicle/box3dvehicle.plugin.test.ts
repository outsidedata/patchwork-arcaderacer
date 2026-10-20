// The browser half of box3dvehicle on a page of a scene of the test's own, booted, loaded and viewed
// over a loopback as a game's page is: its dust, thrown from the land a mod hands it. The car's rows
// are written by the test, a chassis and four wheels with no rule to move them, and the car's row
// naming them, as box3dvehicle's server half names its parts; each wheel stands where the test puts
// it and goes and spins as fast as the test says. The land is `field`'s, a game's own plugin of the
// test's, shipped beside the scene with its land for box3dvehicle (`field.box3dvehicle.ts`): `at`
// metres high at the origin, rising `slope` [x, z] a metre, so it is nowhere the rows' own height;
// and, where the scene's field is `muddy`, spraying mud ahead of x 0, nothing behind it on the +z
// side, and the car's own dust behind it on the -z side, and marking 0.9 ahead of x 0, 0 behind it
// on the +z side, and nothing of its own behind it on the -z side. Beside them, a car whose look names
// a model, `machine`, a glb this file builds and writes to a folder of its own, which the page's real
// loader reads and decodes; a closed car with no cabin; and an open one with none.
import { afterAll, expect, test, vi } from 'vitest'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, relative } from 'node:path'
import { pathToFileURL } from 'node:url'
import * as THREE from 'three'
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js'
import { boot, type Row, type Scene } from '#engine/engine.ts'
import { accept, link, load, manager, view } from '#addons/scenemanager/scenemanager.addon.ts'
import { loopback } from '#addons/loopback/loopback.addon.ts'
import { written } from '#plugins/loader/loader.sim.ts'
import { scenemanager } from '#plugins/scenemanager/scenemanager.sim.ts'
import type { Effect } from '#plugins/particle3d/particle3d.plugin.ts'
import { corners, type Axle, type Lights, type Paint, type Point, type Vehicle } from './box3dvehicle.sim.ts'

const DT = 1 / 60
;(globalThis as any).addEventListener = () => {}
;(globalThis as any).removeEventListener = () => {}
let clock = 0
vi.spyOn(performance, 'now').mockImplementation(() => clock)

const EFFECTS_URL = '/box3dvehicle-plugin-test/effects.json'
written(EFFECTS_URL, JSON.stringify({ cap: 50, effects: { dust: [{ every: 0.05, life: [0.2, 0.2] }], mud: [{ every: 0.05, life: [0.2, 0.2] }] } }))

const axle = (at: number, steered: boolean): Axle => ({
  at, track: 1.7, mount: 0.2,
  wheel: { radius: 0.36, width: 0.28, mass: 20, friction: 0.9, rollingResistance: 0 },
  spring: { stiffness: 16000, length: 0.55, travel: 0.3, sag: 0.1 },
  damper: { bump: 800, rebound: 1600 },
  bumpStop: { length: 0.06, stiffness: 30000 },
  antiRoll: 8000, driven: true, steered,
})
// Tracks a fifth opaque on ground that gives no mark, half more while sliding faster than 2 m/s, a
// piece every 0.3 m, fading over 10 s, eight pieces a tyre.
const TRACKS = { colour: 0x204060, opacity: 0.2, skid: 0.5, slide: 2, clear: 0.1, step: 0.3, life: 10, max: 8, lift: 0.02 }
// Headlights throwing 100 cd beams, tail lights glowing 0.5 and 4 at a full brake, and reverse lights.
const LIGHTS: Lights = {
  radius: 0.1, depth: 0.05, bezel: 0.02,
  beam: { intensity: 100, distance: 50, decay: 2, angle: 0.4, penumbra: 0.5, dip: 0.1 },
  tail: { glow: 0.5, brake: 4, light: { intensity: 3, distance: 6, decay: 2 } },
  reverse: { glow: 2, light: { intensity: 5, distance: 8, decay: 2 } },
}
// The steering wheel's turn at full lock, radians, and the car's points: a seat and a foot on the
// chassis, and a grip on the steering wheel turned `GRIP` (a quarter turn about x, then a third about y).
const LOCK = 2
const GRIP = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 3)).toArray() as [number, number, number, number]
const POINTS: Record<string, Point> = {
  seat: [-0.6, -0.05, -0.325],
  footL: { at: [0.1, -0.18, -0.4] },
  gripL: { at: [0.05, 0.45, -0.45], part: 'steer', turn: GRIP },
}
// Dust thrown from a wheel within 0.1 m of the land going faster than 1.5 m/s across it, and tracks.
const vehicle: Vehicle = {
  body: { length: 3.6, width: 1.3, height: 0.5, mass: 600, center: [0.1, -0.1, 0], friction: 0.9, cabin: { at: -0.2, length: 1.9, width: 1.2, top: 1.2, topWidth: 1, height: 0.5 } },
  bodies: {},
  axles: [axle(1.25, true), axle(-1.25, false)],
  engine: { spinSpeed: 30, spinTorque: 300, brakeTorque: 600, coastTorque: 0 },
  steering: { angle: 0.5, hertz: 5, dampingRatio: 1, maxTorque: 1e4 },
  look: {
    paint: { body: 0, cabin: 0, trim: 0, glass: 0, light: 0, tail: 0, amber: 0, tyre: 0, rim: 0, chrome: 0, seat: 0, hook: 0, spring: 0, damper: 0, arm: 0 },
    segments: 16, spokes: 5, rim: 0.6, coils: 6, coilRadius: 0.07, wire: 0.01, arm: 0.03,
    lock: LOCK, points: POINTS,
    dust: { effect: 'dust', clear: 0.1, speed: 1.5 },
    tracks: TRACKS,
    lights: LIGHTS,
    finish: { glass: { roughness: 0.02, metalness: 0, opacity: 0.25 }, body: { roughness: 0.4, metalness: 0.1, clearcoat: 1, clearcoatRoughness: 0.05 } },
    tread: { blocks: 12, depth: 0.04, angle: 0.4 },
    fenders: { gap: 0.1, thickness: 0.04, flare: 0.05, round: 0.015, ease: 0.3, square: 3 },
    bumpers: { depth: 0.15, height: 0.15, overhang: 0.3, round: 0.03, bolts: 4, hooks: 0.45 },
    grille: { slots: 7, width: 0.6, height: 0.2, depth: 0.06, paint: 'body' },
    spare: { lift: 0.1 },
    open: {
      windshield: { height: 0.5, lean: 0.35, frame: 0.05, wiper: 0.3 },
      cage: { height: 0.6, tube: 0.035, bend: 0.12, pad: 0.05 },
      wall: 0.06, floor: 0.08, corner: 0.14,
      door: { from: -1, to: 0.4, drop: 0.2, ease: 0.18 },
      rib: { at: -0.12, depth: 0.012, height: 0.03 },
      seat: { width: 0.45, depth: 0.45, base: 0.12, back: 0.5, round: 0.04, tilt: 0.18, head: 0.16 },
      bench: true, steer: 0.17,
      dash: { depth: 0.12, height: 0.18 },
      tunnel: { width: 0.26, height: 0.08 }, stick: 0.28,
      hood: { drop: 0.04, round: 0.035, dome: { inset: 0.14, height: 0.02 } },
      rocker: { height: 0.08, depth: 0.05 },
      mirror: { size: 0.12, arm: 0.1 },
    },
  },
}
const R = 0.36

const FIELD = { at: 0.4, slope: [0.2, -0.1] }
const fieldHeight = (x: number, z: number) => FIELD.at + FIELD.slope[0] * x + FIELD.slope[1] * z

// ---------------------------------------------------------------- a model

// Three's exporter reads its blobs back with a FileReader, which node does not have.
class Reader {
  result: ArrayBuffer | undefined
  onloadend = () => {}
  readAsArrayBuffer(b: Blob) { void b.arrayBuffer().then(r => { this.result = r; this.onloadend() }) }
}
async function glbOf(scene: THREE.Object3D): Promise<Uint8Array> {
  vi.stubGlobal('FileReader', Reader)
  try {
    return new Uint8Array(await new GLTFExporter().parseAsync(scene, { binary: true }) as ArrayBuffer)
  } finally {
    vi.unstubAllGlobals()
  }
}
// A machine in its own units, +x forward, +y up, +z right: a hull, a see-through windscreen, two
// beam nodes on the nose pitched `DIP` down, tail lenses either side at the back, a reverse lens on
// the left under its tail lens, an amber lens on the nose, and, unless `plain`, a steering wheel, a
// mesh node `steer` at `STEER` pitched `COLUMN` down, its x down the column.
const DIP = 0.1
const BEAMS: [number, number, number][] = [[1.6, 0.6, -0.5], [1.6, 0.6, 0.5]]
const TAILS: [number, number, number][] = [[-1.5, 0.5, -0.5], [-1.5, 0.5, 0.5]]
const REVERSE: [number, number, number] = [-1.5, 0.3, -0.5]
const HULL: [number, number, number] = [0, 0.5, 0]
const STEER: [number, number, number] = [0.3, 1.1, -0.5]
const COLUMN = 0.7
function machine(plain = false) {
  const root = new THREE.Group()
  const mesh = (name: string, at: number[], size: number, material: THREE.Material) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(size, size, size), material)
    m.name = name
    m.position.fromArray(at)
    root.add(m)
  }
  mesh('hull', HULL, 1, new THREE.MeshStandardMaterial({ name: 'paint', color: 0x336699 }))
  mesh('glass', [0.5, 1.2, 0], 0.5, new THREE.MeshStandardMaterial({ name: 'glass', color: 0xffffff, transparent: true, opacity: 0.3 }))
  const lens = new THREE.MeshStandardMaterial({ name: 'lens', color: 0x888888 })
  TAILS.forEach((at, i) => mesh(`tail.${'LR'[i]}`, at, 0.1, lens))
  mesh('reverse.L', REVERSE, 0.1, lens)
  mesh('amber.L', [1.5, 0.9, -0.6], 0.1, lens)
  BEAMS.forEach((at, i) => {
    const node = new THREE.Object3D()
    node.name = `beam.${'LR'[i]}`
    node.position.fromArray(at)
    node.rotation.z = -DIP
    root.add(node)
  })
  if (!plain) {
    const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.03, 6, 16).rotateY(Math.PI / 2), new THREE.MeshStandardMaterial({ name: 'rim', color: 0x222222 }))
    wheel.name = 'steer'
    wheel.position.fromArray(STEER)
    wheel.quaternion.setFromAxisAngle(new THREE.Vector3(0, 0, 1), -COLUMN)
    root.add(wheel)
  }
  return root
}
const models = mkdtempSync(join(tmpdir(), 'box3dvehicle-model-'))
afterAll(() => rmSync(models, { recursive: true }))
writeFileSync(join(models, 'machine.glb'), await glbOf(machine()))
writeFileSync(join(models, 'plain.glb'), await glbOf(machine(true)))
// The loader reads a model's url under the folder the tests run from.
const MACHINE_URL = '/' + relative(process.cwd(), join(models, 'machine.glb'))
const PLAIN_URL = '/' + relative(process.cwd(), join(models, 'plain.glb'))
// Every paint its own colour, so a part is known by its material.
const PAINT: Paint = {
  body: 0x100001, cabin: 0x100002, trim: 0x100003, glass: 0x100004, light: 0x100005, tail: 0x100006, amber: 0x100007,
  tyre: 0x100008, rim: 0x100009, chrome: 0x10000a, seat: 0x10000b, hook: 0x10000c, spring: 0x10000d, damper: 0x10000e, arm: 0x10000f,
}
// The model drawn half size, its origin 0.2 m ahead of the chassis's and 0.25 m down.
const MODEL = { asset: 'machine', at: [0.2, -0.25, 0] as [number, number, number], scale: 0.5 }
// The jeep with the model in place of its body: every drawn part of the body still in its look.
const modelCar: Vehicle = { ...vehicle, look: { ...vehicle.look, paint: PAINT, dust: undefined, tracks: undefined, model: MODEL } }
// The same with a model that has no steering wheel, its points on the chassis alone, and with them the
// grip on the steering wheel too.
const plainCar: Vehicle = { ...modelCar, look: { ...modelCar.look, model: { ...MODEL, asset: 'plain' }, points: { seat: POINTS.seat } } }
const plainGripped: Vehicle = { ...plainCar, look: { ...plainCar.look, points: POINTS } }
// A closed car with no cabin, and nothing else in the body's paint: its body's box alone; its points on
// the chassis alone, as it draws no steering wheel.
const { cabin: _, ...boxBody } = vehicle.body
const boxCar: Vehicle = { ...vehicle, body: boxBody, look: { ...vehicle.look, paint: PAINT, open: undefined, fenders: undefined, grille: undefined, dust: undefined, tracks: undefined, points: { seat: POINTS.seat } } }
// The same with the grip on the steering wheel it does not draw; and the open car with a point riding
// a part no look draws, as a scene file can write one.
const boxGripped: Vehicle = { ...boxCar, look: { ...boxCar.look, points: POINTS } }
const doored: Vehicle = { ...vehicle, look: { ...vehicle.look, dust: undefined, tracks: undefined, points: JSON.parse('{ "handle": { "at": [0, 0, 0], "part": "door" } }') } }
// The open jeep with no cabin to build round.
const roofless: Vehicle = { ...vehicle, body: boxBody, look: { ...vehicle.look, dust: undefined, tracks: undefined } }

// ---------------------------------------------------------------- an engine heard

// Three loops of an engine, as WAVs the page's real loader reads and decodes through audio's context,
// each its own number of samples so a buffer is known by its length; and a fourth layer's file that is
// not there.
const wavOf = (samples: number) => {
  const b = Buffer.alloc(44 + samples * 2)
  b.write('RIFF', 0, 'latin1'); b.writeUInt32LE(36 + samples * 2, 4); b.write('WAVEfmt ', 8, 'latin1')
  b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(48000, 24); b.writeUInt32LE(96000, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34)
  b.write('data', 36, 'latin1'); b.writeUInt32LE(samples * 2, 40)
  return b
}
const LOOPS = { idle: 100, mid: 200, high: 300, idleOff: 110, midOff: 210 }
for (const [name, n] of Object.entries(LOOPS)) writeFileSync(join(models, `${name}.wav`), wavOf(n))
// The engine's manifest beside its loops, as the library writes it: layers given out of order, so the page
// sorts them, idle at 1000 rpm, mid at 3000, high at 6000, each with its `on` loop, and the overrun's
// `off` loops at idle and mid alone; its mix `on` at 0.2 with the throttle shut and 1 at full, `off` at 0.8
// shut and none at full. And a manifest naming a file that is not beside it.
const ENGINE = {
  mix: { stems: { on: [0.2, 1], off: [0.8, 0] } },
  layers: [{ rpm: 3000, stems: { on: 'mid.wav', off: 'midOff.wav' } }, { rpm: 1000, stems: { on: 'idle.wav', off: 'idleOff.wav' } }, { rpm: 6000, stems: { on: 'high.wav' } }],
}
writeFileSync(join(models, 'engine.json'), JSON.stringify(ENGINE))
writeFileSync(join(models, 'lost.json'), JSON.stringify({ ...ENGINE, layers: [...ENGINE.layers, { rpm: 8000, stems: { on: 'lost.wav' } }] }))
const fileUrl = (name: string) => '/' + relative(process.cwd(), join(models, name))
// The car's sound: the engine, heard from 1 m ahead of the chassis's origin and 0.2 m up, fading out over 80 m.
const SOUND = { engine: 'engine', at: [1, 0.2, 0] as [number, number, number], range: 80 }
const still = { pos: [0, 1, 0], rot: [0, 0, 0, 1], vel: [0, 0, 0], spin: [0, 0, 0] }
// A car heard, in a scene that lists audio and the loader, its catalogue the manifests, naming audio's
// `sound` mod or not; a car whose engine names a file that is not there; the heard car with its
// throttle heard following the row's by e every 0.1 s; and with the overrun's gain its own.
const heardCar: Vehicle = { ...vehicle, body: { ...vehicle.body }, look: { ...vehicle.look, dust: undefined, tracks: undefined, sound: SOUND } }
const lostCar: Vehicle = { ...heardCar, look: { ...heardCar.look, sound: { ...SOUND, engine: 'lost' } } }
const easedCar: Vehicle = { ...heardCar, look: { ...heardCar.look, sound: { ...SOUND, ease: 0.1 } } }
const ownCar: Vehicle = { ...heardCar, look: { ...heardCar.look, sound: { ...SOUND, stems: { off: [0.5, 0.1] } } } }
const heardOf = (car: Vehicle, named: boolean, plugins = ['scenemanager', 'loader', 'shipped', 'box3dvehicle', 'particle3d', 'render3d', 'audio']): Scene => {
  const s = yardOf(plugins, ['field'], undefined, false, car)
  const world = s.world!
  world.loader.assets = { ...world.loader.assets, engine: { type: 'json', url: fileUrl('engine.json') }, lost: { type: 'json', url: fileUrl('lost.json') } }
  world.audio = { hold: 0.25, space: { model: 'linear', ref: 5, max: 40, rolloff: 1 }, cues: {} }
  if (named) world.box3dvehicle.mods = { sound: 'audio' }
  return s
}
// A car of `car`'s vehicle in a scene that lists `plugins` and ships what `shipped` lists, its land
// `land`, its field muddy or not, its catalogue the effects and the machine.
const yardOf = (plugins: string[], shipped: string[], land?: string, muddy = false, car: Vehicle = vehicle): Scene => ({
  world: {
    loader: { assets: { effects: { type: 'json', url: EFFECTS_URL, preload: true }, machine: { type: 'model', url: MACHINE_URL }, plain: { type: 'model', url: PLAIN_URL } } },
    particle3d: { effects: 'effects' },
    shipped: { plugins: shipped },
    field: { ...FIELD, muddy },
    box3dvehicle: { chassis: 'body', wheel: 'tyre', joint: 'axle', vehicles: { car }, ...(land && { mods: { land } }) },
  },
  prefabs: {
    engine: { dt: DT, width: 320, height: 200 }, scenemanager: { out: {} }, loader: {},
    render3d: { camera: { fov: 60, near: 0.1, far: 500, at: [0, 6, 12], look: [0, 0, 0] } },
    body: still, tyre: still, box3dvehicle: {},
  },
  actors: [{ is: 'scenemanager' }, { is: 'loader' }, { is: 'body' }, ...[0, 1, 2, 3].map(() => ({ is: 'tyre' })), { is: 'box3dvehicle', vehicle: 'car' }],
  plugins,
  seats: 1,
})
const scenes: Record<string, Scene> = {
  // The field's land, field shipped before box3dvehicle.
  dusty: yardOf(['scenemanager', 'loader', 'shipped', 'box3dvehicle', 'particle3d', 'render3d'], ['field'], 'field'),
  // The same, its field muddy.
  muddy: yardOf(['scenemanager', 'loader', 'shipped', 'box3dvehicle', 'particle3d', 'render3d'], ['field'], 'field', true),
  // No land named.
  bare: yardOf(['scenemanager', 'loader', 'shipped', 'box3dvehicle', 'particle3d', 'render3d'], ['field']),
  // The field's land, field shipped after box3dvehicle.
  late: yardOf(['scenemanager', 'loader', 'box3dvehicle', 'shipped', 'particle3d', 'render3d'], ['field'], 'field'),
  // terrain3d's land, and no terrain3d listed.
  unlisted: yardOf(['scenemanager', 'loader', 'box3dvehicle', 'particle3d', 'render3d'], [], 'terrain3d'),
  // The car drawn from the machine model.
  modelled: yardOf(['scenemanager', 'loader', 'shipped', 'box3dvehicle', 'particle3d', 'render3d'], ['field'], undefined, false, modelCar),
  // A closed car with no cabin.
  boxed: yardOf(['scenemanager', 'loader', 'shipped', 'box3dvehicle', 'particle3d', 'render3d'], ['field'], undefined, false, boxCar),
  // An open car with no cabin.
  roofless: yardOf(['scenemanager', 'loader', 'shipped', 'box3dvehicle', 'particle3d', 'render3d'], ['field'], undefined, false, roofless),
  // A model with no steering wheel, its points on the chassis; and with the grip on the wheel too.
  plain: yardOf(['scenemanager', 'loader', 'shipped', 'box3dvehicle', 'particle3d', 'render3d'], ['field'], undefined, false, plainCar),
  plainGripped: yardOf(['scenemanager', 'loader', 'shipped', 'box3dvehicle', 'particle3d', 'render3d'], ['field'], undefined, false, plainGripped),
  // A closed car with the grip on the wheel it does not draw; the open car with a point on a door.
  boxGripped: yardOf(['scenemanager', 'loader', 'shipped', 'box3dvehicle', 'particle3d', 'render3d'], ['field'], undefined, false, boxGripped),
  doored: yardOf(['scenemanager', 'loader', 'shipped', 'box3dvehicle', 'particle3d', 'render3d'], ['field'], undefined, false, doored),
  // A car heard through audio's sound mod; the same naming no mod; one listing no loader; one with a
  // layer whose file is not there.
  heard: heardOf(heardCar, true),
  unheard: heardOf(heardCar, false),
  unloaded: heardOf(heardCar, true, ['scenemanager', 'shipped', 'box3dvehicle', 'render3d', 'audio']),
  lost: heardOf(lostCar, true),
  eased: heardOf(easedCar, true),
  own: heardOf(ownCar, true),
}
const dir = mkdtempSync(join(tmpdir(), 'box3dvehicle-plugin-'))
afterAll(() => rmSync(dir, { recursive: true }))
const from = (p: string) => JSON.stringify(new URL(p, import.meta.url).pathname)
for (const [name, s] of Object.entries(scenes)) {
  writeFileSync(join(dir, `${name}.scene.json`), JSON.stringify(s))
  writeFileSync(join(dir, `${name}.sim.ts`), `
import { scenemanager } from ${from('../scenemanager/scenemanager.sim.ts')}
import { loader } from ${from('../loader/loader.sim.ts')}
import file from './${name}.scene.json' with { type: 'json' }
export const sim = { scenemanager, loader, body: {}, tyre: {}, box3dvehicle: {} }
export const scene = file
`)
}
mkdirSync(join(dir, 'plugins', 'field'), { recursive: true })
writeFileSync(join(dir, 'plugins', 'field', 'field.plugin.ts'), 'export function field() { return {} }\n')
writeFileSync(join(dir, 'plugins', 'field', 'field.box3dvehicle.ts'), `
export const land = (plugins: any) => {
  const { at, slope, muddy } = plugins.wire.scene.world.field
  return {
    height: (x: number, z: number) => at + slope[0] * x + slope[1] * z,
    ...(muddy && {
      spray: (x: number, z: number) => (x > 0 ? 'mud' : z > 0 ? false : undefined),
      mark: (x: number, z: number) => (x > 0 ? 0.9 : z > 0 ? 0 : undefined),
    }),
  }
}
`)
const home = pathToFileURL(dir + '/').href

// A page on the scene `entry`, its car's row naming its parts, and its frames, not yet stepped.
async function open(entry: string) {
  const top: Scene = {
    world: {},
    plugins: ['scenemanager'],
    seats: 1,
    prefabs: { engine: { dt: DT }, scenemanager: { scenes: { [entry]: { file: `${entry}.scene.json`, suspend: false } }, dt: DT, entry, port: 0 } },
    actors: [{ is: 'scenemanager' }],
  }
  const truth = boot(structuredClone(top), { scenemanager })
  const yard = (await load(truth, home)).get(entry)!
  const surface = (s: Scene) => ({ addEventListener: () => {}, style: {} as any, width: s.prefabs.engine.width, height: s.prefabs.engine.height, remove() {} })
  const page = view(link(loopback(accept(manager(truth)))), top, home, (me, s) => { me.plugins.render3d.canvas = surface(s) })
  const frames = async (k: number) => {
    for (let i = 0; i < k; i++) { truth.step(DT); clock += DT * 1000; await page.frame() }
  }
  const wheels = yard.rows.filter(r => r.kind === 'tyre').sort((a, b) => a.id - b.id)
  const car = yard.rows.find(r => r.kind === 'box3dvehicle')!
  const chassis = yard.rows.find(r => r.kind === 'body')!
  Object.assign(car.data, { chassis: chassis.id, wheels: wheels.map(r => r.id) })
  return { page, frames, wheels, car, chassis }
}

// Each wheel under its corner moved `shift` metres along x, `lift` metres above the field's land,
// going `vel` and spinning `spin`.
function stand(wheels: Row[], vel: number[], lift = 0, spin = [0, 0, 0], shift = 0) {
  corners(vehicle).forEach((c, i) => {
    const x = c.mount[0] + shift, z = (c.side * c.axle.track) / 2
    Object.assign(wheels[i].data, { pos: [x, fieldHeight(x, z) + R + lift, z], vel, spin })
  })
}
const thrown = (page: { client?: any }, name: string): Effect[] => page.client!.plugins.particle3d.effects.filter((fx: Effect) => fx.name === name)
const dusts = (page: { client?: any }): Effect[] => thrown(page, 'dust')
const live = (fxs: Effect[]) => fxs.filter(fx => fx.life === Infinity)
const back = (fx: Effect) => [-1, 0.5, 0].forEach((n, k) => expect(fx.dir![k]).toBeCloseTo(n, 9))

test('with a land mod named, a wheel on the land going faster than `speed` throws dust at the land under it, back from its way and up by half as much, until it slows or leaves the land', async () => {
  const { page, frames, wheels } = await open('dusty')
  // Each wheel 0.05 m off the land, within `clear`.
  stand(wheels, [3, 0, -4], 0.05)
  await frames(3)
  const thrown = dusts(page)
  expect(thrown).toHaveLength(4)
  corners(vehicle).forEach((c, i) => {
    const x = c.mount[0], z = (c.side * c.axle.track) / 2
    // The field's height there, not the wheel's bottom: the land the mod hands.
    expect(thrown[i].at[1]).toBeCloseTo(fieldHeight(x, z), 9)
    expect(thrown[i].at[0]).toBeCloseTo(x, 9)
    expect(thrown[i].at[2]).toBeCloseTo(z, 9)
    expect(thrown[i].dir).toEqual([-3 / 5, 0.5, 4 / 5])
    expect(thrown[i].life).toBe(Infinity)
  })
  // The first wheel lifted 0.2 m off the land, more than `clear`, and the rest slowed under `speed`.
  stand(wheels, [1, 0, 0])
  wheels[0].data.pos[1] += 0.2
  wheels[0].data.vel = [3, 0, -4]
  await frames(2)
  // Each stopped: its life cut to the age it had then, which particle3d has aged past since.
  for (const fx of thrown) {
    expect(fx.life).not.toBe(Infinity)
    expect(fx.life).toBeLessThanOrEqual(fx.age)
  }
  expect(dusts(page).filter(fx => fx.life === Infinity)).toHaveLength(0)
})

test('a wheel spinning on the spot faster than `speed` at its tread throws dust the way its tread pushes the ground, as one rolling throws it back from its way', async () => {
  const { page, frames, wheels } = await open('dusty')
  // Standing still, each spinning forward (about -z) at 10 rad/s: its tread goes back at 3.6 m/s.
  stand(wheels, [0, 0, 0], 0.05, [0, 0, -10])
  await frames(3)
  const spun = dusts(page)
  expect(spun).toHaveLength(4)
  for (const fx of spun) back(fx)
  // Rolling at 3.6 m/s and spinning so, its tread still on the ground: thrown back from its way, as before.
  stand(wheels, [3.6, 0, 0], 0.05, [0, 0, -10])
  await frames(2)
  expect(live(dusts(page))).toHaveLength(4)
  for (const fx of live(dusts(page))) back(fx)
  // Spinning slower than `speed` at its tread, and still: nothing.
  stand(wheels, [0, 0, 0], 0.05, [0, 0, -2])
  await frames(2)
  expect(live(dusts(page))).toHaveLength(0)
})

test('a wheel throws what the land sprays under it, nothing where it sprays false, and its own dust where it sprays nothing of its own, and changes as it rolls from one to the other', async () => {
  const { page, frames, wheels } = await open('muddy')
  // The front wheels ahead of x 0 on mud; behind, the left (-z) on its own dust and the right on nothing.
  stand(wheels, [3, 0, 0], 0.05)
  await frames(3)
  const mud = live(thrown(page, 'mud')), dust = live(dusts(page))
  expect(mud.map(fx => fx.at[0])).toEqual([1.25, 1.25])
  expect(dust).toHaveLength(1)
  expect(dust[0].at[2]).toBeCloseTo(-0.85, 9)
  // Every wheel moved 3 m back, all behind x 0: the mud stops, the left front throws dust, the right front nothing.
  stand(wheels, [3, 0, 0], 0.05, [0, 0, 0], -3)
  await frames(2)
  for (const fx of mud) expect(fx.life).toBeLessThanOrEqual(fx.age)
  expect(live(thrown(page, 'mud'))).toHaveLength(0)
  expect(live(dusts(page)).map(fx => fx.at[2]).sort()).toEqual([-0.85, -0.85])
})

// Each tyre's track, in corner order.
const tracksOf = (page: { client?: any }): any[] => {
  const found: any[] = []
  page.client!.plugins.render3d.scene.traverse((o: any) => { if (o.name === 'box3dvehicle.track') found.push(o) })
  return found
}
// The pieces a track draws, and each one's opacity and its corners' [x, y, z].
const pieces = (mesh: any) => {
  const n = mesh.geometry.drawRange.count / 6, p = mesh.geometry.attributes.position.array, c = mesh.geometry.attributes.color.array
  return Array.from({ length: n }, (_, i) => ({ alpha: c[16 * i + 3], at: [0, 1, 2, 3].map(k => Array.from(p.slice(12 * i + 3 * k, 12 * i + 3 * k + 3)) as number[]) }))
}
// A piece laid within the last few frames: `strength` opaque, faded by at most 3% of its life.
const fresh = (alpha: number, strength: number) => { expect(alpha).toBeLessThanOrEqual(strength + 1e-6); expect(alpha).toBeGreaterThan(strength * 0.97) }
// Rolls the car `metres` along +x from `from`, a frame each `by` metres, its wheels going 6 m/s,
// `lift` off the land, and spinning `spin`: rolling, their tread still on the ground, unless it says.
async function roll(frames: (k: number) => Promise<void>, wheels: Row[], from: number, metres: number, by = 0.1, lift = 0.05, spin = [0, 0, -6 / R]) {
  for (let s = 0; s <= metres / by + 1e-9; s++) { stand(wheels, [6, 0, 0], lift, spin, from + s * by); await frames(1) }
}

test('a tyre rolling on the land lays a track its width across, on the land and lifted, a piece every `step` metres, at `opacity` where the land marks nothing of its own', async () => {
  const { page, frames, wheels } = await open('dusty')
  await roll(frames, wheels, 0, 1)
  const tracks = tracksOf(page)
  expect(tracks).toHaveLength(4)
  corners(vehicle).forEach((c, i) => {
    const laid = pieces(tracks[i])
    // A metre in 0.1 m frames: the first place, then a piece each 0.3 m, three.
    expect(laid).toHaveLength(3)
    for (const piece of laid) {
      fresh(piece.alpha, TRACKS.opacity)
      for (const [x, y, z] of piece.at) expect(y).toBeCloseTo(fieldHeight(x, z) + TRACKS.lift, 4)
      // Its two near corners the tyre's width apart, across its way.
      expect(Math.hypot(piece.at[0][0] - piece.at[1][0], piece.at[0][2] - piece.at[1][2])).toBeCloseTo(c.axle.wheel.width, 4)
      expect(piece.at[0][0]).toBeCloseTo(piece.at[1][0], 4)
    }
  })
})

test('a tyre lifted off the land breaks its track, and one that lays more than `max` pieces lays each over its oldest', async () => {
  const { page, frames, wheels } = await open('dusty')
  await roll(frames, wheels, 0, 1)
  const [track] = tracksOf(page)
  // Lifted half a metre, more than `clear`, and rolled on: nothing laid, and no piece spans the gap.
  await roll(frames, wheels, 1.1, 1, 0.1, 0.5)
  expect(pieces(track)).toHaveLength(3)
  await roll(frames, wheels, 2.2, 0.7)
  const after = pieces(track)
  expect(after).toHaveLength(5)
  for (const piece of after.slice(3)) expect(piece.at[0][0]).toBeGreaterThan(2.2 + corners(vehicle)[0].mount[0] - 1e-6)
  // Rolled far on: the most it keeps is `max`.
  await roll(frames, wheels, 3, 5)
  expect(pieces(track)).toHaveLength(TRACKS.max)
})

test('a track is as dark as the land marks it, none where it marks 0, darker by `skid` while the tread slides, and fades over `life`', async () => {
  const { page, frames, wheels } = await open('muddy')
  // A metre back, so the front wheels stay ahead of x 0 and the back ones behind it throughout.
  await roll(frames, wheels, -1, 1)
  const [frontLeft, frontRight, rearLeft, rearRight] = tracksOf(page).map(pieces)
  // Ahead of x 0 the land marks 0.9; behind, on -z it gives none (`opacity`), on +z it marks 0.
  for (const laid of [frontLeft, frontRight]) for (const p of laid) fresh(p.alpha, 0.9)
  for (const p of rearLeft) fresh(p.alpha, TRACKS.opacity)
  expect(rearRight).toHaveLength(0)
  // Rolling at 6 m/s spinning 30 rad/s forward: the tread slides at 4.8 m/s, past `slide`.
  const tracks = tracksOf(page)
  await roll(frames, wheels, 0.1, 0.6, 0.1, 0.05, [0, 0, -30])
  fresh(pieces(tracks[2]).at(-1)!.alpha, TRACKS.opacity + TRACKS.skid)
  // 0.9 and the skid's 0.5, held at 1.
  fresh(pieces(tracks[0]).at(-1)!.alpha, 1)
  // Half its life on, every piece half as dark; its whole life on, none.
  const before = pieces(tracks[2]).map(p => p.alpha)
  clock += (TRACKS.life / 2) * 1000
  await frames(1)
  pieces(tracks[2]).forEach((p, i) => expect(p.alpha).toBeCloseTo(before[i] / 2, 2))
  clock += TRACKS.life * 1000
  await frames(1)
  for (const p of pieces(tracks[2])) expect(p.alpha).toBe(0)
})

test('a car\'s tracks go with it', async () => {
  const { page, frames, wheels } = await open('dusty')
  await roll(frames, wheels, 0, 1)
  expect(tracksOf(page)).toHaveLength(4)
  page.client!.plugins.box3dvehicle.close(page.client!.plugins)
  expect(tracksOf(page)).toHaveLength(0)
})

test('with no land mod named, no wheel throws dust, as on no ground', async () => {
  const { page, frames, wheels } = await open('bare')
  stand(wheels, [3, 0, -4])
  await frames(3)
  expect(dusts(page)).toHaveLength(0)
})

// The car's chassis as the page draws it: the scene's child holding its beams.
const chassisOf = (page: { client?: any }): any => page.client!.plugins.render3d.scene.children.find((o: any) => o.children.some((c: any) => c.name === 'box3dvehicle.beam'))
const named = (page: { client?: any }, name: string): any[] => {
  const found: any[] = []
  page.client!.plugins.render3d.scene.traverse((o: any) => { if (o.name === name) found.push(o) })
  return found
}
const lightCount = (page: { client?: any }) => {
  let n = 0
  page.client!.plugins.render3d.scene.traverse((o: any) => { if (o.isLight) n++ })
  return n
}

test('the headlights throw beams ahead and down, the tail lights brighten as the car brakes, and the reverse lights light only while it drives backwards, none of it changing how many lights there are', async () => {
  const { page, frames, car } = await open('dusty')
  await frames(2)
  const beams = named(page, 'box3dvehicle.beam'), [brake] = named(page, 'box3dvehicle.brake'), [reverse] = named(page, 'box3dvehicle.reverse')
  const [tail] = named(page, 'box3dvehicle.tail'), [backup] = named(page, 'box3dvehicle.backup')
  expect(beams).toHaveLength(2)
  for (const b of beams) {
    expect(b.intensity).toBe(LIGHTS.beam.intensity)
    expect(b.angle).toBe(LIGHTS.beam.angle)
    expect(b.castShadow).toBe(false)
    // Its target `dip` radians below straight ahead, in the chassis's frame.
    const d = b.target.position.clone().sub(b.position)
    expect(Math.atan2(-d.y, d.x)).toBeCloseTo(LIGHTS.beam.dip, 9)
  }
  const lights = lightCount(page)
  expect([brake.intensity, reverse.intensity, backup.material.emissiveIntensity]).toEqual([0, 0, 0])
  expect(tail.material.emissiveIntensity).toBe(LIGHTS.tail.glow)
  // Half a brake: halfway from the glow to a full brake's, and half the brake light.
  car.data.brake = 0.5
  await frames(2)
  expect(tail.material.emissiveIntensity).toBeCloseTo(LIGHTS.tail.glow + (LIGHTS.tail.brake - LIGHTS.tail.glow) / 2, 9)
  expect(brake.intensity).toBeCloseTo(LIGHTS.tail.light.intensity / 2, 9)
  expect(reverse.intensity).toBe(0)
  // Let go, and the throttle back: a direct-drive car going backwards.
  car.data.brake = 0
  car.data.throttle = -1
  await frames(2)
  expect(tail.material.emissiveIntensity).toBe(LIGHTS.tail.glow)
  expect(brake.intensity).toBe(0)
  expect(reverse.intensity).toBe(LIGHTS.reverse.light.intensity)
  expect(backup.material.emissiveIntensity).toBe(LIGHTS.reverse.glow)
  expect(lightCount(page)).toBe(lights)
})

test('an open car\'s body is drawn as one mesh a material beside its named lenses and its steering wheel, every material physical, the glass see-through and casting no shadow, and each wheel likewise', async () => {
  const { page, frames } = await open('dusty')
  await frames(2)
  const chassis = chassisOf(page)
  const meshes: any[] = []
  chassis.traverse((o: any) => { if (o.isMesh && !o.name && o.parent.name !== 'box3dvehicle.steer') meshes.push(o) })
  const materials = new Set(meshes.map(m => m.material))
  expect(materials.size).toBe(meshes.length)
  // The steering wheel, one mesh a material of its own: its trim rim and spokes, its chrome hub.
  const [steer] = named(page, 'box3dvehicle.steer')
  expect(steer.parent).toBe(chassis)
  const own = steer.children.filter((o: any) => o.isMesh)
  expect(own).toHaveLength(2)
  expect(new Set(own.map((m: any) => m.material)).size).toBe(2)
  for (const m of own) { expect(m.castShadow).toBe(true); expect(m.receiveShadow).toBe(true) }
  // body, trim, glass, chrome, seat, light, tail's lenses aside, hook, rim, tyre, amber and arm: a handful.
  expect(meshes.length).toBeLessThanOrEqual(14)
  for (const m of meshes) expect(m.material.isMeshPhysicalMaterial).toBe(true)
  const glass = meshes.find(m => m.material.opacity === 0.25)!
  expect(glass.material.transparent).toBe(true)
  expect(glass.castShadow).toBe(false)
  const body = meshes.find(m => m.material.clearcoat === 1)!
  expect(body.castShadow).toBe(true)
  // The body's panels reach the fenders' flare past the wheels and the bumpers past them.
  body.geometry.computeBoundingBox()
  const c = corners(vehicle)[0]
  expect(body.geometry.boundingBox.max.z).toBeCloseTo(c.axle.track / 2 + c.axle.wheel.width / 2 + vehicle.look.fenders!.flare, 4)
  // A wheel: a tyre, a steel wheel and its chrome, one mesh each.
  const wheel = page.client!.plugins.render3d.scene.children.find((o: any) => o !== chassis && o.isGroup && o.children.length && o.children.every((m: any) => m.isMesh))
  expect(wheel.children).toHaveLength(3)
})

test('a scene with dust whose land is a plugin listed after box3dvehicle, or one it does not list, throws on the first frame', async () => {
  await expect((await open('late')).frames(3)).rejects.toThrow('box3dvehicle is listed before field, whose land it reads that frame')
  await expect((await open('unlisted')).frames(3)).rejects.toThrow('box3dvehicle\'s land is terrain3d\'s, which this scene does not list')
})

// ---------------------------------------------------------------- a model, and no cabin

// The scene's object drawn on the chassis row: the group `box3dvehicle.model`'s parent, or, with no
// model, the scene's child that holds the arms' mesh.
const meshesOf = (o: any): any[] => { const found: any[] = []; o.traverse((m: any) => { if (m.isMesh) found.push(m) }); return found }
const colourOf = (m: any) => m.material.color.getHex()
// What the model's point `p`, in its own units, is in the world: the chassis row stands at [0, 1, 0]
// unturned, and the model's origin at `MODEL.at` on it, `MODEL.scale` metres to its unit.
const onChassis = (p: number[]) => p.map((c, k) => still.pos[k] + MODEL.at[k] + MODEL.scale * c)
const near = (a: number[], b: number[]) => a.forEach((c, k) => expect(c).toBeCloseTo(b[k], 6))

test('a car whose look names a model draws it on the chassis in place of its body, the wheels and corners as before, with nothing of the body until the loader has it', async () => {
  const { page, frames, wheels } = await open('modelled')
  // Each wheel under its corner, so each is drawn somewhere of its own.
  stand(wheels, [0, 0, 0], 0.05)
  await frames(1)
  const scene = page.client!.plugins.render3d.scene
  // The first frame the car is drawn, its model still coming: no model and no body.
  expect(named(page, 'box3dvehicle.model')).toHaveLength(0)
  const bare = scene.children.find((o: any) => o.isGroup && meshesOf(o).some(m => colourOf(m) === PAINT.arm))
  expect(meshesOf(bare).map(colourOf)).toEqual([PAINT.arm])
  for (let i = 0; i < 200 && !named(page, 'box3dvehicle.model').length; i++) { await new Promise(r => setTimeout(r, 5)); await frames(1) }
  const [model] = named(page, 'box3dvehicle.model')
  expect(model).toBeDefined()
  const chassis = model.parent
  expect(chassis).toBe(bare)
  // On the chassis: its own meshes and the arms' one mesh, nothing of the body, the fenders, the
  // bumpers, the grille, the spare, the open tub or the drawn lamps.
  const own = meshesOf(model)
  expect(meshesOf(chassis).filter(m => !own.includes(m)).map(colourOf)).toEqual([PAINT.arm])
  expect([...named(page, 'box3dvehicle.tail'), ...named(page, 'box3dvehicle.backup')]).toHaveLength(0)
  // The hull where the model puts it on the chassis, at its scale.
  scene.updateMatrixWorld(true)
  const hull = own.find(m => m.name === 'hull')
  near(hull.getWorldPosition(new THREE.Vector3()).toArray(), onChassis(HULL))
  near(hull.getWorldScale(new THREE.Vector3()).toArray(), [MODEL.scale, MODEL.scale, MODEL.scale])
  // Each wheel drawn on its row, a tyre, a steel wheel and its chrome.
  for (const w of wheels) {
    const g = scene.children.find((o: any) => o !== chassis && o.isGroup && o.position.distanceTo(new THREE.Vector3(...w.data.pos)) < 1e-9)
    expect(g.children).toHaveLength(3)
  }
  // Each corner's spring, damper and rod.
  expect(scene.children.filter((o: any) => o.isMesh && o.material.color.getHex() === PAINT.spring)).toHaveLength(4)
})

test('every mesh of a model takes shadows and all but the see-through cast them; each beam node throws a beam where it is, along its +x; its tail lenses glow brighter as the car brakes, the brake light at their middle', async () => {
  const { page, frames, car } = await open('modelled')
  await frames(1)
  for (let i = 0; i < 200 && !named(page, 'box3dvehicle.model').length; i++) { await new Promise(r => setTimeout(r, 5)); await frames(1) }
  const [model] = named(page, 'box3dvehicle.model')
  const scene = page.client!.plugins.render3d.scene
  scene.updateMatrixWorld(true)
  const own = meshesOf(model), by = (name: string) => own.filter(m => m.name.startsWith(name))
  const [hull] = by('hull'), [glass] = by('glass')
  for (const m of own) expect(m.receiveShadow).toBe(true)
  expect(hull.castShadow).toBe(true)
  expect(glass.castShadow).toBe(false)
  // The beams: one a beam node, where the node is, aimed along its +x, pitched `DIP` down.
  const beams = named(page, 'box3dvehicle.beam')
  expect(beams).toHaveLength(BEAMS.length)
  beams.forEach((b, i) => {
    expect(b.intensity).toBe(LIGHTS.beam.intensity)
    expect(b.angle).toBe(LIGHTS.beam.angle)
    expect(b.castShadow).toBe(false)
    const at = b.getWorldPosition(new THREE.Vector3())
    near(at.toArray(), onChassis(BEAMS[i]))
    const aim = b.target.getWorldPosition(new THREE.Vector3()).sub(at).normalize()
    near(aim.toArray(), [Math.cos(DIP), -Math.sin(DIP), 0])
  })
  // The lenses take the car's lamp materials, and its brake and reverse lights stand at their middle.
  const tails = by('tail'), [reverse] = by('reverse'), [amber] = by('amber')
  expect(tails).toHaveLength(TAILS.length)
  expect(colourOf(tails[0])).toBe(PAINT.tail)
  expect(colourOf(reverse)).toBe(PAINT.light)
  expect(colourOf(amber)).toBe(PAINT.amber)
  expect(amber.material.emissive.getHex()).toBe(PAINT.amber)
  const [brake] = named(page, 'box3dvehicle.brake'), [backing] = named(page, 'box3dvehicle.reverse')
  near(brake.getWorldPosition(new THREE.Vector3()).toArray(), onChassis([0, 1, 2].map(k => (TAILS[0][k] + TAILS[1][k]) / 2)))
  near(backing.getWorldPosition(new THREE.Vector3()).toArray(), onChassis(REVERSE))
  expect(tails.map(m => m.material.emissiveIntensity)).toEqual([LIGHTS.tail.glow, LIGHTS.tail.glow])
  expect(brake.intensity).toBe(0)
  const lights = lightCount(page)
  // A full brake: the tail lenses glow as a drawn car's do, and the brake light comes on.
  car.data.brake = 1
  await frames(2)
  expect(tails.map(m => m.material.emissiveIntensity)).toEqual([LIGHTS.tail.brake, LIGHTS.tail.brake])
  expect(brake.intensity).toBe(LIGHTS.tail.light.intensity)
  expect(reverse.material.emissiveIntensity).toBe(0)
  // Backwards: the reverse lens glows.
  Object.assign(car.data, { brake: 0, throttle: -1 })
  await frames(2)
  expect(reverse.material.emissiveIntensity).toBe(LIGHTS.reverse.glow)
  expect(tails[0].material.emissiveIntensity).toBe(LIGHTS.tail.glow)
  expect(lightCount(page)).toBe(lights)
})

test('a closed car with no cabin draws its body\'s box alone', async () => {
  const { page, frames } = await open('boxed')
  await frames(2)
  const chassis = page.client!.plugins.render3d.scene.children.find((o: any) => o.isGroup && meshesOf(o).some(m => colourOf(m) === PAINT.body))
  const colours = meshesOf(chassis).map(colourOf)
  expect(colours).not.toContain(PAINT.cabin)
  const body = meshesOf(chassis).find(m => colourOf(m) === PAINT.body)
  body.geometry.computeBoundingBox()
  const { min, max } = body.geometry.boundingBox, { length, height, width } = boxBody
  near(min.toArray(), [-length / 2, -height / 2, -width / 2])
  near(max.toArray(), [length / 2, height / 2, width / 2])
})

test('an open car with no cabin throws on the frame it is drawn, naming the vehicle', async () => {
  await expect((await open('roofless')).frames(2)).rejects.toThrow('world.box3dvehicle.vehicles.car.look.open is built round body.cabin, and its body has none')
})

// ---------------------------------------------------------------- the steering wheel and the points

const v3 = (a: number[]) => new THREE.Vector3(a[0], a[1], a[2])
const q4 = (a: number[]) => new THREE.Quaternion(a[0], a[1], a[2], a[3])
const about = (axis: number[], angle: number) => new THREE.Quaternion().setFromAxisAngle(v3(axis), angle)
// Two turns the same, whichever sign their quaternions take.
const sameTurn = (a: THREE.Quaternion, b: THREE.Quaternion) => expect(Math.abs(a.dot(b))).toBeCloseTo(1, 9)
// The chassis row off the origin and turned: 0.7 rad to the left about up, then 0.1 nose-down.
const PLACE = { pos: [2, 1.5, -3], rot: about([0, 1, 0], 0.7).multiply(about([0, 0, 1], -0.1)).toArray() }
const inWorld = (p: number[]) => v3(p).applyQuaternion(q4(PLACE.rot)).add(v3(PLACE.pos))
const worldOf = (o: any) => ({ at: o.getWorldPosition(new THREE.Vector3()), turn: o.getWorldQuaternion(new THREE.Quaternion()), scale: o.getWorldScale(new THREE.Vector3()) })
const GRIP_AT = (POINTS.gripL as { at: number[] }).at
// The page's model of the car, framed until the loader has it.
const waitModel = async (page: { client?: any }, frames: (k: number) => Promise<void>) => {
  for (let i = 0; i < 200 && !named(page, 'box3dvehicle.model').length; i++) { await new Promise(r => setTimeout(r, 5)); await frames(1) }
  return named(page, 'box3dvehicle.model')[0]
}

test('the open car\'s steering wheel, rim, spokes and hub, turns about its column by the car row\'s steer times `lock`, its top to the left on a left steer, and back', async () => {
  const { page, frames, car } = await open('dusty')
  await frames(2)
  const [steer] = named(page, 'box3dvehicle.steer'), o = vehicle.look.open!, arm = vehicle.look.arm
  // Made as the chassis's frame pitched 0.6 down the column.
  const rest = about([0, 0, 1], -0.6)
  sameTurn(steer.quaternion, rest)
  // Its rim and spokes in its y–z plane, the rim `steer` round its origin: nothing of the column.
  for (const m of steer.children.filter((c: any) => c.isMesh)) {
    m.geometry.computeBoundingBox()
    const { min, max } = m.geometry.boundingBox
    expect(Math.max(-min.x, max.x)).toBeLessThanOrEqual(arm * 0.8 + 1e-6)
    for (const k of ['y', 'z'] as const) expect(Math.max(-min[k], max[k])).toBeLessThanOrEqual(o.steer + arm * 0.6 + 1e-6)
  }
  // The top of the rim, in the chassis's frame.
  const top = () => { steer.updateMatrix(); return new THREE.Vector3(0, o.steer, 0).applyMatrix4(steer.matrix) }
  const hub = steer.position.clone(), straight = top()
  for (const s of [0.5, -1, 1]) {
    car.data.steer = s
    await frames(1)
    sameTurn(steer.quaternion, rest.clone().multiply(about([1, 0, 0], -s * LOCK)))
    const now = top()
    // Turned |steer| × lock round the hub, toward the left (-z) on a left steer (positive).
    expect(now.clone().sub(hub).angleTo(straight.clone().sub(hub))).toBeCloseTo(Math.abs(s) * LOCK, 9)
    expect(Math.sign(now.z - straight.z)).toBe(-Math.sign(s))
  }
  car.data.steer = 0
  await frames(1)
  sameTurn(steer.quaternion, rest)
})

test('each point of the look is an empty of its name on the chassis, where the chassis row\'s place and turn put its `at`, its frame the chassis\'s, and `point` hands it out', async () => {
  const { page, frames, car, chassis } = await open('dusty')
  Object.assign(chassis.data, { pos: PLACE.pos, rot: PLACE.rot })
  await frames(2)
  const plugin = page.client!.plugins.box3dvehicle
  page.client!.plugins.render3d.scene.updateMatrixWorld(true)
  for (const [name, at] of [['seat', POINTS.seat as number[]], ['footL', (POINTS.footL as { at: number[] }).at]] as const) {
    const o = plugin.point(car.id, name)
    expect(o.name).toBe(name)
    expect(o.parent).toBe(chassisOf(page))
    const w = worldOf(o)
    near(w.at.toArray(), inWorld(at).toArray())
    sameTurn(w.turn, q4(PLACE.rot))
    sameTurn(o.parent.getWorldQuaternion(new THREE.Quaternion()), q4(PLACE.rot))
  }
  expect(plugin.point(car.id, 'nothing')).toBeUndefined()
  expect(plugin.point(car.id + 100, 'seat')).toBeUndefined()
  // A car no longer drawn has none.
  plugin.close(page.client!.plugins)
  expect(plugin.point(car.id, 'seat')).toBeUndefined()
})

test('a point riding `steer` is on the steering wheel: at its `at` and turned its `turn` in the chassis\'s frame with the wheel straight, and turned with the wheel about its column', async () => {
  const { page, frames, car, chassis } = await open('dusty')
  Object.assign(chassis.data, { pos: PLACE.pos, rot: PLACE.rot })
  await frames(2)
  const scene = page.client!.plugins.render3d.scene
  const grip = page.client!.plugins.box3dvehicle.point(car.id, 'gripL'), [steer] = named(page, 'box3dvehicle.steer')
  expect(grip.parent).toBe(steer)
  scene.updateMatrixWorld(true)
  let w = worldOf(grip)
  near(w.at.toArray(), inWorld(GRIP_AT).toArray())
  sameTurn(w.turn, q4(PLACE.rot).multiply(q4(GRIP)))
  near(w.scale.toArray(), [1, 1, 1])
  // Full left: turned `lock` about the column through the hub, in the chassis's frame.
  car.data.steer = 1
  await frames(1)
  scene.updateMatrixWorld(true)
  const rest = about([0, 0, 1], -0.6), spin = rest.clone().multiply(about([1, 0, 0], -LOCK)).multiply(rest.clone().invert())
  const hub = steer.position.clone(), turned = v3(GRIP_AT).sub(hub).applyQuaternion(spin).add(hub)
  w = worldOf(grip)
  near(w.at.toArray(), inWorld(turned.toArray()).toArray())
  sameTurn(w.turn, q4(PLACE.rot).multiply(spin).multiply(q4(GRIP)))
})

test('a model\'s `steer` node turns about its own x by steer times `lock`, and a point riding `steer` hangs on it once the model comes, at its `at` in the chassis\'s frame whatever the model\'s place and scale', async () => {
  const { page, frames, car } = await open('modelled')
  await frames(1)
  const plugin = page.client!.plugins.box3dvehicle
  // Before the model comes: the points on the chassis, and none on its wheel.
  expect(plugin.point(car.id, 'seat')).toBeDefined()
  expect(plugin.point(car.id, 'gripL')).toBeUndefined()
  const model = await waitModel(page, frames)
  const node = model.getObjectByName('steer'), grip = plugin.point(car.id, 'gripL')
  expect(grip.parent).toBe(node)
  const rest = about([0, 0, 1], -COLUMN)
  sameTurn(node.quaternion, rest)
  const scene = page.client!.plugins.render3d.scene
  scene.updateMatrixWorld(true)
  const atStill = v3(GRIP_AT).add(v3(still.pos))
  let w = worldOf(grip)
  near(w.at.toArray(), atStill.toArray())
  sameTurn(w.turn, q4(GRIP))
  near(w.scale.toArray(), [1, 1, 1])
  // Steered half right: the node turned half of `lock` about its own x, the grip with it about the
  // node's origin, which is where the model puts `STEER`.
  car.data.steer = -0.5
  await frames(1)
  sameTurn(node.quaternion, rest.clone().multiply(about([1, 0, 0], 0.5 * LOCK)))
  scene.updateMatrixWorld(true)
  const spin = rest.clone().multiply(about([1, 0, 0], 0.5 * LOCK)).multiply(rest.clone().invert()), origin = v3(onChassis(STEER))
  near(node.getWorldPosition(new THREE.Vector3()).toArray(), origin.toArray())
  w = worldOf(grip)
  near(w.at.toArray(), atStill.clone().sub(origin).applyQuaternion(spin).add(origin).toArray())
  sameTurn(w.turn, spin.clone().multiply(q4(GRIP)))
})

test('a model with no `steer` node draws its points on the chassis and turns nothing', async () => {
  const { page, frames, car } = await open('plain')
  await frames(1)
  const model = await waitModel(page, frames)
  expect(model).toBeDefined()
  car.data.steer = 1
  await frames(2)
  const seat = page.client!.plugins.box3dvehicle.point(car.id, 'seat')
  page.client!.plugins.render3d.scene.updateMatrixWorld(true)
  near(seat.getWorldPosition(new THREE.Vector3()).toArray(), v3(POINTS.seat as number[]).add(v3(still.pos)).toArray())
})

test('a point riding a part the look does not draw throws naming it: a closed car\'s steering wheel and a door on the frame the car is made, and a model\'s steering wheel on the frame a model with none comes', async () => {
  await expect((await open('boxGripped')).frames(2)).rejects.toThrow('world.box3dvehicle.vehicles.car.look.points.gripL rides steer, which the look draws nothing of')
  await expect((await open('doored')).frames(2)).rejects.toThrow('world.box3dvehicle.vehicles.car.look.points.handle rides door, which the look draws nothing of')
  const { frames } = await open('plainGripped')
  let thrown: unknown
  for (let i = 0; i < 200 && thrown === undefined; i++) {
    await new Promise(r => setTimeout(r, 5))
    await frames(1).catch(e => { thrown = e })
  }
  expect(String(thrown)).toContain('world.box3dvehicle.vehicles.car.look.points.gripL rides steer, and its model plain has no node whose name starts steer')
})

// ---------------------------------------------------------------- an engine heard

// A stand-in AudioContext, running from the start, that decodes a WAV to a buffer of its length in
// samples and keeps every source started, the params each was set and scheduled with, and where the
// panner it plays through stands.
class Param {
  events: unknown[][] = []
  constructor(public value: number) {}
  setTargetAtTime(v: number, t: number, c: number) { this.events.push(['target', v, t, c]) }
}
class Node { out?: any; connect(n: any) { this.out = n; return n } }
class Gain extends Node { gain = new Param(1) }
class Panner extends Node {
  positionX = new Param(0); positionY = new Param(0); positionZ = new Param(0)
  distanceModel = 'inverse'; refDistance = 1; maxDistance = 10000; rolloffFactor = 1
  at() { return [this.positionX.value, this.positionY.value, this.positionZ.value] }
}
class Source extends Node {
  buffer: { length: number } | null = null
  loop = false; loopStart = 0; loopEnd = 0
  playbackRate = new Param(1)
  onended: (() => void) | null = null
  stopped?: number
  constructor(private ctx: Ctx) { super() }
  start() { this.ctx.started.push(this) }
  stop(when = 0) { this.stopped = when }
  // The nodes it plays through, to the destination.
  get chain() { const all: any[] = []; for (let n = this.out; n; n = n.out) all.push(n); return all }
  get gain(): Gain { return this.chain[0] }
  get panner(): Panner | undefined { return this.chain.find(n => n instanceof Panner) }
}
class Ctx {
  state = 'running'
  currentTime = 2
  destination = new Node()
  listener = { positionX: new Param(0), positionY: new Param(0), positionZ: new Param(0), forwardX: new Param(0), forwardY: new Param(0), forwardZ: new Param(-1), upX: new Param(0), upY: new Param(1), upZ: new Param(0) }
  started: Source[] = []
  static made: Ctx[] = []
  constructor() { Ctx.made.push(this) }
  addEventListener() {}
  createBufferSource() { return new Source(this) }
  createGain() { return new Gain() }
  createPanner() { return new Panner() }
  decodeAudioData(bytes: ArrayBuffer) { return Promise.resolve({ length: (bytes.byteLength - 44) / 2 }) }
  resume() { return Promise.resolve() }
  close() { return Promise.resolve() }
}
// The page of scene `entry` on the stand-in context, and the context.
async function heard(entry: string) {
  Ctx.made = []
  vi.stubGlobal('AudioContext', Ctx)
  const opened = await open(entry)
  return { ...opened, ctx: () => Ctx.made.at(-1)! }
}
// Frames until the context, made with the page's client on its first frame, has started `n` sources,
// the loader reading and decoding in its own time.
const until = async (frames: (k: number) => Promise<void>, ctx: () => Ctx, n: number) => {
  await frames(1)
  for (let i = 0; i < 200 && ctx().started.length < n; i++) { await new Promise(r => setTimeout(r, 5)); await frames(1) }
}
const SORTED = [...ENGINE.layers].sort((a, b) => a.rpm - b.rpm)
// The target each loop's param was last sent toward.
const last = (p: Param) => p.events.at(-1)![1] as number

test('a car with a sound plays each stem\'s loops once every one has come: each at the row\'s rpm over its own, the two either side crossfaded at equal power, each stem as loud as its gain at the throttle, from its point', async () => {
  try {
    const { frames, car, ctx } = await heard('heard')
    // Between idle (1000) and mid (3000), halfway; the throttle halfway, so `on` 0.2 + 0.8 × 0.5 = 0.6 and
    // `off` 0.8 − 0.8 × 0.5 = 0.4.
    Object.assign(car.data, { rpm: 2000, throttle: 0.5 })
    await until(frames, ctx, 5)
    const [idle, mid, high, idleOff, midOff] = ctx().started
    expect(ctx().started.map(s => s.buffer!.length)).toEqual([LOOPS.idle, LOOPS.mid, LOOPS.high, LOOPS.idleOff, LOOPS.midOff])
    expect(ctx().started.every(s => s.loop)).toBe(true)
    expect([idle, mid, high].map(s => s.playbackRate.value)).toEqual(SORTED.map(l => 2000 / l.rpm))
    expect([idleOff, midOff].map(s => s.playbackRate.value)).toEqual([2, 2 / 3])
    for (const [s, w] of [[idle, Math.SQRT1_2 * 0.6], [mid, Math.SQRT1_2 * 0.6], [high, 0], [idleOff, Math.SQRT1_2 * 0.4], [midOff, Math.SQRT1_2 * 0.4]] as const) expect(s.gain.gain.value).toBeCloseTo(w, 12)
    // From 1 m ahead of the chassis and 0.2 m up: the chassis at [0, 1, 0] unturned.
    for (const s of ctx().started) {
      near(s.panner!.at(), [1, 1.2, 0])
      expect(s.panner!.maxDistance).toBe(80)
    }
    // At 2500 rpm, three quarters of the way from idle to mid, the throttle full: the overrun silent.
    Object.assign(car.data, { rpm: 2500, throttle: 1 })
    await frames(1)
    expect(last(idle.gain.gain)).toBeCloseTo(Math.cos((0.75 * Math.PI) / 2), 12)
    expect(last(mid.gain.gain)).toBeCloseTo(Math.sin((0.75 * Math.PI) / 2), 12)
    expect(last(high.gain.gain)).toBe(0)
    expect([last(idleOff.gain.gain), last(midOff.gain.gain)]).toEqual([0, 0])
    expect([idle, mid, high].map(s => last(s.playbackRate))).toEqual(SORTED.map(l => 2500 / l.rpm))
    expect(ctx().started).toHaveLength(5)
  } finally { vi.unstubAllGlobals() }
})

test('above a stem\'s highest layer only it is heard; below its lowest only it, as much quieter as the rpm is below its, none at 0; the brake is no throttle', async () => {
  try {
    const { frames, car, ctx } = await heard('heard')
    Object.assign(car.data, { rpm: 1000, throttle: 0 })
    await until(frames, ctx, 5)
    const [idle, mid, high, idleOff, midOff] = ctx().started
    const gains = () => [idle, mid, high, idleOff, midOff].map(s => last(s.gain.gain))
    // Past the overrun's highest layer, mid at 3000, only it of the overrun.
    Object.assign(car.data, { rpm: 7000, throttle: 1 })
    await frames(1)
    expect(gains()).toEqual([0, 0, 1, 0, 0])
    expect(last(high.playbackRate)).toBe(7000 / 6000)
    Object.assign(car.data, { rpm: 4000, throttle: 0 })
    await frames(1)
    expect(gains().slice(3)).toEqual([0, 0.8])
    expect(last(midOff.playbackRate)).toBe(4000 / 3000)
    Object.assign(car.data, { rpm: 400, throttle: -1 })
    await frames(1)
    expect(gains()[0]).toBeCloseTo(0.4 * 0.2, 12)
    expect(gains()[3]).toBeCloseTo(0.4 * 0.8, 12)
    expect([gains()[1], gains()[2], gains()[4]]).toEqual([0, 0, 0])
    expect(last(idle.playbackRate)).toBe(0.4)
    Object.assign(car.data, { rpm: 0, throttle: 0 })
    await frames(1)
    expect(gains()).toEqual([0, 0, 0, 0, 0])
  } finally { vi.unstubAllGlobals() }
})

test('with an ease, the throttle heard follows the row\'s by e of the way every ease seconds of the page\'s clock', async () => {
  try {
    const { frames, car, ctx } = await heard('eased')
    Object.assign(car.data, { rpm: 3000, throttle: 0 })
    await until(frames, ctx, 5)
    const [, mid, , , midOff] = ctx().started
    // Started at the throttle heard, shut, and held there while it stays shut.
    expect(mid.gain.gain.value).toBeCloseTo(0.2, 12)
    await frames(1)
    expect(last(mid.gain.gain)).toBeCloseTo(0.2, 12)
    // The throttle opened at once: a frame of 1/60 s later the heard throttle is 1 − e^(−(1/60)/0.1) of the way.
    Object.assign(car.data, { throttle: 1 })
    await frames(1)
    const share = 1 - Math.exp(-DT / 0.1)
    expect(last(mid.gain.gain)).toBeCloseTo(0.2 + 0.8 * share, 9)
    expect(last(midOff.gain.gain)).toBeCloseTo(0.8 - 0.8 * share, 9)
    await frames(1)
    expect(last(mid.gain.gain)).toBeCloseTo(0.2 + 0.8 * (1 - Math.exp(-2 * DT / 0.1)), 9)
  } finally { vi.unstubAllGlobals() }
})

test('the loops follow the car as it moves and turns, and stop with it', async () => {
  try {
    const { page, frames, car, chassis, ctx } = await heard('heard')
    Object.assign(car.data, { rpm: 1500, throttle: 1 })
    await until(frames, ctx, 5)
    // Turned a quarter about y, the car's forward is -z: its point 1 m ahead is 1 m along -z.
    const quarter = about([0, 1, 0], Math.PI / 2).toArray()
    Object.assign(chassis.data, { pos: [5, 2, 7], rot: quarter })
    await frames(1)
    for (const s of ctx().started) near(s.panner!.at(), [5, 2.2, 6])
    ctx().currentTime = 9
    page.client!.plugins.box3dvehicle.close(page.client!.plugins)
    for (const s of ctx().started) {
      expect(s.stopped).toBeCloseTo(9 + 5 * DT, 12)
      expect(s.gain.gain.events.at(-1)).toEqual(['target', 0, 9, DT])
    }
  } finally { vi.unstubAllGlobals() }
})

test('a scene\'s stems lie over the manifest\'s one stem at a time: its own overrun gain, the manifest\'s on', async () => {
  try {
    const { frames, car, ctx } = await heard('own')
    Object.assign(car.data, { rpm: 1000, throttle: 0 })
    await until(frames, ctx, 5)
    const [idle, , , idleOff] = ctx().started
    expect(idle.gain.gain.value).toBeCloseTo(0.2, 12)
    expect(idleOff.gain.gain.value).toBeCloseTo(0.5, 12)
    Object.assign(car.data, { throttle: 1 })
    await frames(1)
    expect(last(idle.gain.gain)).toBeCloseTo(1, 12)
    expect(last(idleOff.gain.gain)).toBeCloseTo(0.1, 12)
  } finally { vi.unstubAllGlobals() }
})

test('a car whose manifest names a file not beside it plays nothing and says so once', async () => {
  const errors = vi.spyOn(console, 'error').mockImplementation(() => {})
  try {
    const { frames, car, ctx } = await heard('lost')
    Object.assign(car.data, { rpm: 2000, throttle: 1 })
    for (let i = 0; i < 20; i++) { await new Promise(r => setTimeout(r, 5)); await frames(1) }
    expect(ctx().started).toHaveLength(0)
    expect(errors.mock.calls.filter(([e]) => String(e).includes('the engine lost names lost.wav, which is not beside it'))).toHaveLength(1)
  } finally { vi.unstubAllGlobals(); errors.mockRestore() }
})

test('on a page with no Web Audio a car with a sound reads nothing of its engine, and draws as ever', async () => {
  const { page, frames, car } = await open('heard')
  Object.assign(car.data, { rpm: 2000, throttle: 1 })
  await frames(1)
  const loader = page.client!.plugins.loader
  const asked = vi.spyOn(loader, 'load'), beside = vi.spyOn(loader, 'beside')
  for (let i = 0; i < 5; i++) { await new Promise(r => setTimeout(r, 5)); await frames(1) }
  expect(asked).not.toHaveBeenCalled()
  expect(beside).not.toHaveBeenCalled()
  expect(loader.ready('engine')).toBe(false)
})

test('a car with a sound throws naming its vehicle where the scene names no sound mod, lists no loader, or its engine writes no rpm', async () => {
  try {
    const named = await heard('unheard')
    Object.assign(named.car.data, { rpm: 1000, throttle: 0 })
    await expect(named.frames(1)).rejects.toThrow('world.box3dvehicle.vehicles.car.look has a sound, and world.box3dvehicle.mods names no sound')
    const unloaded = await heard('unloaded')
    Object.assign(unloaded.car.data, { rpm: 1000, throttle: 0 })
    await expect(unloaded.frames(1)).rejects.toThrow('world.box3dvehicle.vehicles.car.look has a sound, and this scene does not list loader')
    await expect((await heard('heard')).frames(1)).rejects.toThrow('world.box3dvehicle.vehicles.car.look has a sound, and its engine writes no rpm: a petrol or electric engine does')
  } finally { vi.unstubAllGlobals() }
})
