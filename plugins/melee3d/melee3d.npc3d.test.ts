// melee3d's mod for npc3d on scenes the test writes: children of one manager in a folder of its own,
// each of swordsmen (npc3d NPCs on its walker body whose one key is `fight`, every rule npc3d's) and
// foes (rows that stand where they are put, of a definition npc3d's sight reads), on flat ground a
// game's own plugin of the folder's, `fixture`, hands walker. Both kinds are posed by anim off a glb
// the test builds and exports, as melee3d's own test does: hips a metre up, a head and a hand, the
// sword held out ahead of the hand (the rig's `grips`). What each swordsman did is read off its row.
import { afterAll, beforeAll, expect, test, vi } from 'vitest'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import * as THREE from 'three'
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js'
import { boot, type Row, type Scene } from '#engine/engine.ts'
import { load, mod } from '#addons/scenemanager/scenemanager.addon.ts'
import { scenemanager } from '#plugins/scenemanager/scenemanager.sim.ts'
import { written } from '#plugins/loader/loader.sim.ts'
import type { Measure } from '#plugins/anim/anim.sim.ts'
import { behaviors } from './melee3d.npc3d.ts'

// Three's exporter reads its blobs back with a FileReader, which node does not have.
class Reader {
  result: ArrayBuffer | undefined
  onloadend = () => {}
  readAsArrayBuffer(b: Blob) { void b.arrayBuffer().then(r => { this.result = r; this.onloadend() }) }
}

// The model, its clips each holding the hips still for a second: `idle`, `cut`, and the guard's three.
const CLIPS = ['idle', 'cut', 'guard', 'hold', 'drop']
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
  const still = (name: string) => new THREE.AnimationClip(name, -1, [new THREE.QuaternionKeyframeTrack('Hips.quaternion', [0, 1], [0, 0, 0, 1, 0, 0, 0, 1])])
  vi.stubGlobal('FileReader', Reader)
  try {
    return new Uint8Array(await new GLTFExporter().parseAsync(root, { binary: true, animations: CLIPS.map(still) }) as ArrayBuffer)
  } finally {
    vi.unstubAllGlobals()
  }
}

const DT = 1 / 60
const measure = (dur: number): Measure => ({ dur, forward: 0, left: 0, yaw: 0, travel: [[0, 0, 0, 0], [dur, 0, 0, 0]] })
const RIG = {
  clips: { idle: { loop: true }, cut: { markers: { hit: 0.5, chain: 0.6, cancel: 0.8 } }, guard: {}, hold: { loop: true }, drop: {} },
  roles: { still: 'idle' },
  table: Object.fromEntries(CLIPS.map(c => [c, measure(1)])),
  blades: ['sword'],
  grips: { model: { sword: { bone: 'Hand', guard: [0, 0, 0.1], tip: [0, 0, 1] } } },
}
const READS = { pos: 'pos', yaw: 'yaw', vel: 'vel', grounded: 'grounded', limp: 'limp' }
const WALKER = {
  radius: 0.35, height: 1.7, accel: 14, turnRate: 8, gravity: 20, jumpH: 0.9, step: 0.55, maxSlope: 0.55, slopeBand: 0.05,
  slide: 2, wade: 0.6, span: 0.7, probe: 1.5, seekSpeed: 1.5, bodies: ['swordsman', 'foe'],
}
const FIGHT = {
  weight: 1, at: 'foes', speed: { walk: 1, run: 3 }, near: 4, reach: 1.5, face: 30, ring: 3, slots: [180, 90, -90], attackers: 1,
  retarget: 0.6, wait: [0, 0], chain: ['cut'], most: 1, heavy: 'cut', heavyOdds: 0, sees: 3, guardOdds: 1, react: [0.1, 0.1],
  block: ['guard', 'hold', 'drop'], unarmed: 2, crawl: { stance: 'crawl', speed: 0.5 },
}
const DEFS = {
  swordsman: {
    body: 'walker', arrive: 0.5, stall: { speed: 0.2, time: 1 }, look: { rate: 4, reach: 80 },
    sight: { eye: 1.6, at: 1.2, cone: 120, range: 30, kinds: ['foe', 'swordsman'] }, notice: { time: 0.2, fall: 2 }, memory: 10,
    think: 0.25, stay: 1, whim: 0, react: [0.05, 0.05], foes: ['foe', 'swordsman'], behaviors: { fight: FIGHT },
  },
  foe: { body: 'walker', strikes: { cut: {} } },
}
const BODY = { vel: [0, 0, 0], grounded: true, sliding: false, speed: 0, want: [0, 0], face: null, jump: false, side: 0, turned: 0, limp: false, health: 100 }
const SWORDSMAN = {
  ...BODY, team: '', pos: [0, 0, 0], yaw: 0, edges: {}, swing: null, struck: [],
  look: 0, gaze: null, seen: [], noticing: {}, facts: [], doing: '', until: 0, wake: 0, arrived: false, told: null, route: null,
  goal: null, stalled: 0, gap: null, rest: null,
  target: null, wait: null, chain: 0, queued: null, guard: false, guardFor: 0, read: null, wary: null, ticked: null,
}
const FOE = { ...BODY, team: 'blue', pos: [0, 0, 0], yaw: 0, state: 'loco', clip: 'idle', clipT: 0, upper: null, upperT: 0, upperW: 0 }

let GLB: Uint8Array
beforeAll(async () => { GLB = await model() })

const dir = mkdtempSync(join(tmpdir(), 'melee3d-npc3d-'))
afterAll(() => rmSync(dir, { recursive: true }))
mkdirSync(join(dir, 'plugins/fixture'), { recursive: true })
writeFileSync(join(dir, 'plugins/fixture/fixture.walker.ts'), 'export const height = () => 0\n')
const path = (p: string) => JSON.stringify(new URL(p, import.meta.url).pathname)

let made = 0
// A child of its own with these actors, booted through the manager; its truth and its rows of each kind.
async function scene(actors: { is: string; [field: string]: unknown }[]) {
  const name = `s${++made}`
  const files = `/melee3d-npc3d-test/${name}`
  written(`${files}/defs.json`, JSON.stringify(DEFS))
  written(`${files}/rig.json`, JSON.stringify(RIG))
  written(`${files}/model.glb`, GLB)
  const kind = { rig: 'rig', model: 'model', glb: 'glb', fade: 0.1, reads: READS }
  const child = {
    world: {
      seed: 7,
      shipped: { plugins: ['fixture'] },
      defs: 'defs',
      loader: { assets: { defs: { type: 'json', url: `${files}/defs.json`, preload: true }, rig: { type: 'json', url: `${files}/rig.json`, preload: true }, glb: { type: 'binary', url: `${files}/model.glb`, preload: true } } },
      anim: { still: 0.05, shift: 0.75, leap: 0.5, landFall: 7.5, moves: 0.05, turns: 30, kinds: { swordsman: kind, foe: kind } },
      walker: { kinds: { swordsman: WALKER, foe: WALKER }, mods: { height: 'fixture' } },
      melee3d: { kinds: ['swordsman', 'foe'], limbs: { torso: { from: 'Hips', to: 'Head', radius: 0.15 } }, spacing: 0.04, edge: 2.5, clash: 0.04 },
      npc3d: { mods: { behaviors: 'melee3d' } },
    },
    prefabs: { engine: { dt: DT }, scenemanager: { out: {} }, loader: {}, npc3d: { time: 0, sounds: [], next: 1 }, swordsman: SWORDSMAN, foe: FOE },
    actors: [{ is: 'scenemanager' }, { is: 'loader' }, { is: 'npc3d' }, ...actors],
    plugins: ['scenemanager'],
  }
  writeFileSync(join(dir, `${name}.scene.json`), JSON.stringify(child))
  writeFileSync(join(dir, `${name}.sim.ts`), `
import { scenemanager } from ${path('../scenemanager/scenemanager.sim.ts')}
import { loader } from ${path('../loader/loader.sim.ts')}
import { npc, npc3d } from ${path('../npc3d/npc3d.sim.ts')}
import file from './${name}.scene.json' with { type: 'json' }
export const sim = { scenemanager, loader, npc3d, swordsman: npc, foe: {} }
export const scene = file
`)
  const top: Scene = {
    prefabs: { engine: { dt: DT }, scenemanager: { scenes: { [name]: { file: `${name}.scene.json`, suspend: false } }, dt: DT, entry: name, port: 0 } },
    actors: [{ is: 'scenemanager' }],
    plugins: ['scenemanager'],
    seats: 1,
  }
  const t = (await load(boot(top, { scenemanager }), pathToFileURL(dir + '/').href)).get(name)!
  const rows = (kind: string) => t.rows.filter((r: Row) => r.kind === kind)
  const steps = (n: number, stop: () => boolean = () => false) => {
    for (let i = 0; i < n; i++) {
      if (stop()) return i
      t.step(DT)
    }
    return n
  }
  return { t, rows, steps }
}
const apart = (a: Row, b: Row) => Math.hypot(a.data.pos[0] - b.data.pos[0], a.data.pos[2] - b.data.pos[2])

test('the scene that names it hands npc3d melee3d\'s fight', async () => {
  const { t } = await scene([])
  expect(mod(t.world, 'npc3d', 'behaviors')).toBe(behaviors)
})

test('a swordsman that notices a foe of another team runs at it, and within reach strikes it with its chain', async () => {
  const { rows, steps } = await scene([{ is: 'swordsman', team: 'red', pos: [0, 0, 0], yaw: 0 }, { is: 'foe', pos: [0, 0, 8] }])
  const [me] = rows('swordsman'), [foe] = rows('foe')
  steps(120, () => me.data.doing === 'fight' && me.data.target === foe.id)
  expect([me.data.doing, me.data.target]).toEqual(['fight', foe.id])
  // Further than `near`, it runs straight at the foe.
  steps(10)
  expect(me.data.want[1]).toBeCloseTo(FIGHT.speed.run, 6)
  const before = apart(me, foe)
  steps(600, () => me.data.state === 'act' && me.data.clip === 'cut')
  expect([me.data.state, me.data.clip]).toEqual(['act', 'cut'])
  expect(apart(me, foe)).toBeLessThan(before)
  expect(apart(me, foe)).toBeLessThanOrEqual(FIGHT.reach + 0.05)
}, 60_000)

test('a swordsman fights no foe it has not noticed, and no body of its own team', async () => {
  const behind = await scene([{ is: 'swordsman', team: 'red', pos: [0, 0, 0], yaw: 0 }, { is: 'foe', pos: [0, 0, -8] }])
  behind.steps(240)
  expect([behind.rows('swordsman')[0].data.doing, behind.rows('swordsman')[0].data.target]).toEqual(['', null])
  const ally = await scene([{ is: 'swordsman', team: 'blue', pos: [0, 0, 0], yaw: 0 }, { is: 'foe', pos: [0, 0, 8] }])
  ally.steps(240)
  const [me] = ally.rows('swordsman')
  expect(me.data.noticing[ally.rows('foe')[0].id].aware).toBe(1)
  expect([me.data.doing, me.data.target]).toEqual(['', null])
}, 60_000)

test('a swordsman judges a foe\'s swing coming at it and raises its guard after its reaction, standing still facing the foe', async () => {
  // The foe 2.5 m ahead, facing the swordsman, in its cut short of the cut's hit marker.
  const { rows, steps } = await scene([{ is: 'swordsman', team: 'red', pos: [0, 0, 0], yaw: 0 }, { is: 'foe', pos: [0, 0, 2.5], yaw: Math.PI, state: 'act', clip: 'cut', clipT: 0.1 }])
  const [me] = rows('swordsman')
  steps(240, () => me.data.guard)
  expect(me.data.guard).toBe(true)
  expect(me.data.read).toBe(`${rows('foe')[0].id}:cut`)
  expect([me.data.state, me.data.clip]).toEqual(['act', 'guard'])
  steps(2)
  expect(me.data.want).toEqual([0, 0])
}, 60_000)

test('of three swordsmen on one foe, the nearest closes on it and the others hold back on the ring round it', async () => {
  const { rows, steps } = await scene([
    { is: 'swordsman', team: 'red', pos: [0, 0, 0], yaw: 0 },
    { is: 'swordsman', team: 'red', pos: [-1.5, 0, -1], yaw: 0 },
    { is: 'swordsman', team: 'red', pos: [1.5, 0, -1], yaw: 0 },
    { is: 'foe', pos: [0, 0, 8], yaw: Math.PI },
  ])
  const [first, ...rest] = rows('swordsman'), [foe] = rows('foe')
  const waiting = () => rest.some(r => Math.abs(apart(r, foe) - FIGHT.ring) < 0.5)
  let struck = false
  steps(900, () => {
    if (rest.some(r => r.data.clip === 'cut')) struck = true
    return waiting() && first.data.clip === 'cut'
  })
  expect(apart(first, foe)).toBeLessThanOrEqual(FIGHT.reach + 0.05)
  expect([waiting(), first.data.clip, struck]).toEqual([true, 'cut', false])
}, 60_000)
