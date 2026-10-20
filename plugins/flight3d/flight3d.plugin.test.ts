// The browser half of flight3d, handed three's own scene, a `world.flight3d` of three planes written
// here and a loader holding a model for each, built here in code as a client's loader would hand one
// over: a group named after the model with a `body` mesh in it, and rows written here. Node has no
// WebGL, and this draws nothing itself: it builds and places three objects, which the test reads by
// their names.
import { expect, test } from 'vitest'
import * as THREE from 'three'
import type { Row } from '#engine/engine.ts'
import type { Plugins } from '#engine/browser.ts'
import type { Flight, Model, Plane, Sheet } from './flight3d.sim.ts'
import { flight3d } from './flight3d.plugin.ts'

// The browser half reads only a plane's `look` and its wheels; the sheet is any one a plane flies with.
const sheet: Sheet = {
  structureMass: 880, maxThrust: 2700, propSpeed: 39.6, throttleRate: 0.5, wingArea: 16.2, span: 11, incidence: 0.063,
  clAlpha: 5.2, clPostStall: 1, alphaStall: 0.32, stallBlend: 0.05, cd0: 0.0365, oswald: 0.8, cdFlatPlate: 1.2, brakeCd: 0.06,
  cyBeta: -0.6, clDeltaA: 0.15, clP: -0.45, cm0: 0.0067, cmAlpha: -1, cmQ: -12, cmDeltaE: 1, cnBeta: 0.08, cnR: -0.2, cnDeltaR: 0.06,
  maxAileron: 0.3, maxElevator: 0.35, maxRudder: 0.35, aileronRate: 2, elevatorRate: 2, rudderRate: 2,
  rGyrRoll: 1.5, rGyrPitch: 1.4, rGyrYaw: 1.8, engineTorque: 474, engineInertia: 3, engineSpin: 283,
}
const entry = (model: string): Model => ({
  airframe: sheet,
  gear: { wheels: [], brakeGrip: 0, sink: 3, touch: [[0, -1, 0]], retract: 0, drag: 0 },
  look: { model, spin: 40, airbrake: 0, gear: 0 },
})
const NAMES = ['biplane', 'monoplane', 'jet']
const f: Flight = {
  gravity: 9.81, air: { density: 1.225, scaleHeight: 8500, calm: 0.5 }, materials: { engineDensity: 40, wingDensity: 10, structureDrag: 0.00005 },
  overspeed: 1.05, sweep: 1, planes: Object.fromEntries(NAMES.map(n => [n, entry(n)])),
}
const world = { flight3d: f }
// A model: the loader's scene, holding a group named after it with its `body` mesh.
const build = (name: string) => {
  const root = new THREE.Group()
  const named = new THREE.Group()
  named.name = name
  const body = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 4), new THREE.MeshStandardMaterial())
  body.name = 'body'
  named.add(body)
  root.add(named)
  return root
}
const models = Object.fromEntries(NAMES.map(n => [n, build(n)]))
const prefab: Plane = {
  type: 'monoplane', pos: [0, 0, 0], rot: [0, 0, 0, 1], vel: [0, 0, 0], spin: [0, 0, 0], aileron: 0, elevator: 0, rudder: 0,
  pitch: 0, roll: 0, yaw: 0, throttle: 0, throttling: 0, airbrake: 0, brake: 0, gear: 1, gearDown: true, press: [], crashed: false,
}
const plane = (id: number, over: Record<string, unknown> = {}): Row =>
  ({ id, kind: 'flight3d', data: { ...prefab, pos: [1, 2, 3], rot: [0, Math.sin(0.3), 0, Math.cos(0.3)], ...over } }) as Row

function page(rows: Row[], landed = () => true) {
  const scene = new THREE.Scene()
  const loads: string[] = []
  const dressed: THREE.Material[] = []
  const loader = {
    ready: (n: string) => landed() && n in models,
    load: (n: string) => { loads.push(n); return Promise.resolve() },
    model: (n: string) => ({ scene: models[n].clone(), animations: [] }),
  }
  const render3d = { THREE, scene, dress: (m: THREE.Material) => { dressed.push(m); return m } }
  const plugins = { render3d, loader, wire: { rows, scene: { world } } } as unknown as Plugins
  const me = flight3d()
  return { scene, plugins, me, loads, dressed, frame: () => me.afterTick(plugins) }
}
const drawn = (scene: THREE.Scene) => scene.children.filter(c => c.getObjectByName('body'))

test('each flight3d row is drawn once, from its own plane\'s model, on its row\'s pos and rot, and goes with its row', () => {
  const rows = [plane(1, { type: 'monoplane' }), plane(2, { type: 'biplane', pos: [50, 60, 70] })]
  const { scene, frame, dressed } = page(rows)
  frame()
  frame()
  const planes = drawn(scene)
  expect(planes).toHaveLength(2)
  expect(planes[0].getObjectByName('monoplane')).toBeTruthy()
  expect(planes[1].getObjectByName('biplane')).toBeTruthy()
  expect(planes[0].position.toArray()).toEqual([1, 2, 3])
  expect(planes[0].quaternion.toArray()).toEqual(rows[0].data.rot)
  expect(planes[1].position.toArray()).toEqual([50, 60, 70])
  // Every mesh casts and takes shadows, its material dressed by render3d.
  planes[0].traverse(o => { if ((o as THREE.Mesh).isMesh) expect([(o as THREE.Mesh).castShadow, (o as THREE.Mesh).receiveShadow]).toEqual([true, true]) })
  expect(dressed.length).toBeGreaterThan(0)
  rows.pop()
  frame()
  expect(drawn(scene)).toHaveLength(1)
  // A row whose plane changes is drawn as its new plane.
  rows[0].data.type = 'jet'
  frame()
  expect(drawn(scene)).toHaveLength(1)
  expect(drawn(scene)[0].getObjectByName('jet')).toBeTruthy()
})

test('a scene whose world.flight3d.kinds lists player draws its player rows as planes, and no row of another kind', () => {
  f.kinds = ['player']
  try {
    const seat = { ...plane(1, { type: 'jet', pos: [5, 6, 7] }), kind: 'player' } as Row
    const { scene, frame } = page([seat, plane(2)])
    frame()
    expect(drawn(scene)).toHaveLength(1)
    expect(drawn(scene)[0].getObjectByName('jet')).toBeTruthy()
    expect(drawn(scene)[0].position.toArray()).toEqual([5, 6, 7])
  } finally {
    delete f.kinds
  }
})

test('a plane is asked of the loader once, and drawn from the frame its model has landed', () => {
  let landed = false
  const { scene, frame, loads } = page([plane(1, { type: 'biplane' }), plane(2, { type: 'biplane' })], () => landed)
  frame()
  frame()
  expect(loads).toEqual(['biplane'])
  expect(drawn(scene)).toHaveLength(0)
  landed = true
  frame()
  expect(drawn(scene)).toHaveLength(2)
})
