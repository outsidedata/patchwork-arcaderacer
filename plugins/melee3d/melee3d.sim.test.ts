// melee3d on a scene the test writes: a swinger, whose model's one clip turns its hips from a quarter
// right to a quarter left about the vertical, its sword held out ahead of its hand, sweeping an arc in
// front of it; and a body of the same model standing a metre ahead. The model is a glb the test builds
// and exports, which anim poses the bodies off (its `glb`), the sword's grip on the hand is the rig's
// `grips`, and the swing is read off what `swing` hands back.
import { beforeAll, expect, test, vi } from 'vitest'
import * as THREE from 'three'
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js'
import { boot, type Row, type Scene, type W } from '#engine/engine.ts'
import { loader, written } from '#plugins/loader/loader.sim.ts'
import type { Measure, Numbers, Rig } from '#plugins/anim/anim.sim.ts'
import { blades, limbs, swing, type Contact } from './melee3d.sim.ts'

// Three's exporter reads its blobs back with a FileReader, which node does not have.
class Reader {
  result: ArrayBuffer | undefined
  onloadend = () => {}
  readAsArrayBuffer(b: Blob) { void b.arrayBuffer().then(r => { this.result = r; this.onloadend() }) }
}

const FRAMES = 30
// The model: hips a metre up, the head 0.7 m over them and the hand 0.3 m over and 0.2 m ahead of them,
// skinning a small box; the clip `cut` turns the hips from −90° to +90° about +y over a second, and
// `idle` holds them still.
async function model(): Promise<Uint8Array> {
  const root = new THREE.Group()
  const bone = (name: string, at: number[], parent?: THREE.Bone) => {
    const b = new THREE.Bone()
    b.name = name
    b.position.fromArray(at)
    parent?.add(b)
    return b
  }
  const hips = bone('Hips', [0, 1, 0])
  const head = bone('Head', [0, 0.7, 0], hips)
  const hand = bone('Hand', [0, 0.3, 0.2], hips)
  const g = new THREE.BoxGeometry(0.1, 0.1, 0.1)
  const n = g.getAttribute('position').count
  g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(new Array(n * 4).fill(0), 4))
  g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(Array.from({ length: n * 4 }, (_, i) => (i % 4 ? 0 : 1)), 4))
  const mesh = new THREE.SkinnedMesh(g, new THREE.MeshBasicMaterial())
  root.add(mesh, hips)
  mesh.bind(new THREE.Skeleton([hips, head, hand]))
  const turn = (u: number) => new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -Math.PI / 2 + Math.PI * u).toArray()
  const cut = new THREE.AnimationClip('cut', -1, [new THREE.QuaternionKeyframeTrack('Hips.quaternion',
    Array.from({ length: FRAMES + 1 }, (_, i) => i / FRAMES), Array.from({ length: FRAMES + 1 }, (_, i) => turn(i / FRAMES)).flat())])
  const idle = new THREE.AnimationClip('idle', -1, [new THREE.QuaternionKeyframeTrack('Hips.quaternion', [0, 1 / 30], [0, 0, 0, 1, 0, 0, 0, 1])])
  vi.stubGlobal('FileReader', Reader)
  try {
    return new Uint8Array(await new GLTFExporter().parseAsync(root, { binary: true, animations: [cut, idle] }) as ArrayBuffer)
  } finally {
    vi.unstubAllGlobals()
  }
}
let GLB: Uint8Array
beforeAll(async () => { GLB = await model() })

const still = (dur: number): Measure => ({ dur, forward: 0, left: 0, yaw: 0, travel: [[0, 0, 0, 0], [dur, 0, 0, 0]] })
const RIG: Rig = {
  clips: { cut: {}, idle: { loop: true } },
  roles: { still: 'idle' },
  table: { cut: still(1), idle: still(1 / 30) },
  blades: ['sword'],
  // The sword from 10 cm to 1 m ahead of the hand.
  grips: { model: { sword: { bone: 'Hand', guard: [0, 0, 0.1], tip: [0, 0, 1] } } },
}
const READS = { pos: 'pos', yaw: 'yaw', vel: 'vel', grounded: 'grounded', limp: 'limp' }
const ANIM: Numbers = {
  still: 0.05, shift: 0.75, leap: 0.5, landFall: 7.5, moves: 0.05, turns: 30,
  kinds: { swinger: { rig: 'rig', model: 'model', glb: 'glb', fade: 0.2, reads: READS }, body: { rig: 'rig', model: 'model', glb: 'glb', fade: 0.2, reads: READS } },
}
const MELEE = { kinds: ['swinger', 'body'], limbs: { torso: { from: 'Hips', to: 'Head', radius: 0.15 } }, spacing: 0.04, edge: 2.5, clash: 0.04 }
const DT = 1 / 60

let files = 0
// The swinger at the origin facing +z, in `live`'s swing, its clip's playhead moved on a step at a
// time; the body `ahead` metres along +z, facing `facing`.
function scene(ahead: number, facing: number) {
  const url = `test/melee3d/${++files}.json`
  written(url, JSON.stringify(RIG))
  written(`test/melee3d/${files}.glb`, GLB)
  const s: Scene = {
    world: { anim: structuredClone(ANIM), melee3d: MELEE, loader: { assets: { rig: { type: 'json', url, preload: true }, glb: { type: 'binary', url: `test/melee3d/${files}.glb`, preload: true } } } },
    prefabs: {
      loader: {},
      swinger: { pos: [0, 0, 0], yaw: 0, limp: false, state: 'act', clip: 'cut', clipT: 0, edges: {}, swing: null, struck: [] },
      body: { pos: [0, 0, ahead], yaw: facing, limp: false, clip: 'idle', clipT: 0 },
      probe: {},
    },
    actors: [{ is: 'loader' }, { is: 'swinger' }, { is: 'body' }, { is: 'probe' }],
  }
  let w!: W
  const t = boot(s, { loader, swinger: {}, body: {}, probe: { before(_me, _dt, got) { w = got } } })
  t.step(0)
  const swinger = t.rows.find(r => r.kind === 'swinger') as Row
  const body = t.rows.find(r => r.kind === 'body') as Row
  // The whole cut, a step at a time: every contact swing hands back, and the step it came on.
  const cut = (live: string | null = 'cut') => {
    const met: [number, Contact][] = []
    swinger.data.clipT = 0
    swing(w, swinger, DT, live)
    for (let k = 1; k <= 60; k++) {
      swinger.data.clipT = k * DT
      for (const c of swing(w, swinger, DT, live)) met.push([k, c])
    }
    return met
  }
  return { w, swinger, body, cut }
}

test('a blade swept through a standing body meets its limb once, where the blade passes, moving the way the blade moves', () => {
  const { w, body, cut } = scene(1, 0)
  const met = cut()
  expect(met.map(([, c]) => [c.what, c.id, c.part])).toEqual([['limb', body.id, 'torso']])
  const [k, c] = met[0]
  // The torso stands a metre ahead; the blade, sweeping from the swinger's right to its left, meets it
  // about halfway through the cut, as it crosses ahead.
  expect(k).toBeGreaterThan(20)
  expect(k).toBeLessThan(40)
  const [torso] = limbs(w, body)
  expect(Math.abs(c.point[2] - torso.a[2])).toBeLessThan(torso.radius + 0.05)
  // The blade crosses ahead moving from −x (the swinger's right) to +x (its left).
  expect(c.dir[0]).toBeGreaterThan(0.9)
  expect(c.speed).toBeGreaterThan(MELEE.edge)
})

test('a body out of the blade\'s reach is not met, nor one in reach while the swinger is in no swing', () => {
  expect(scene(2.5, 0).cut()).toEqual([])
  expect(scene(1, 0).cut(null)).toEqual([])
})

test('a body out of reach holding its blade into the arc is met at its blade', () => {
  // Turned to face the swinger 1.6 m off, its torso past the swinger's tip, its sword points back
  // along −z from 1.3 m to 0.4 m, into the swinger's arc.
  const { body, cut } = scene(1.6, Math.PI)
  expect(cut().map(([, c]) => [c.what, c.id, c.part])).toEqual([['blade', body.id, 'sword']])
})

test('a body\'s blade stands on its posed bone, guard to tip, turned by its yaw and moved to its feet', () => {
  const { w, body } = scene(1, Math.PI)
  const [b] = blades(w, body)
  // Facing −z, the hand 0.2 m ahead of the hips is at z 0.8, and the blade runs on toward the origin.
  expect(b.guard.map(v => +v.toFixed(9))).toEqual([0, 1.3, 0.7])
  expect(b.tip.map(v => +v.toFixed(9))).toEqual([0, 1.3, -0.2])
})
