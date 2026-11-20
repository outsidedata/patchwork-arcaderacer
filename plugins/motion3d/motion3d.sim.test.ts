// motion3d on a scene the test writes into a game folder of its own and boots through the scenemanager's
// `load`, so its mods are loaded as a game's are: shapes3d hands its shapes as spaces
// (`shapes3d.motion3d.ts`). The ground is level land (terrain3d's). A `party` zone, a mat 4 m square,
// offers `party`, whose `emote` plays `backflip`; a `stage`, a mat 2 m square on the party zone's far
// half, offers `show` at priority 2, whose `emote` plays `bow` and then the party's emote, an activity of
// its own named across (`party.emote`): the body's motion3d file says so, and its
// baked file holds each clip's spot (the root) and offsets (none). The body is a `body` row kinematics3d
// walks on the level ground and motion3d plays by a rig the test writes (its kind's entry of
// `world.motion3d.kinds`): its rule picks `stand` or `walk`
// while it is free, and holds it, until its clip has played out, while it is in a zone's activity. Its
// walk has moves played over it from `Spine1` up (`UPPER`): a held aim, a shot from it, a wave; and its rig
// an `aim`. The backflip marks its tuck and holds a `strike` window open from half its length to three
// quarters; the walk marks a step at half its lap; the shot marks itself. A `probe` row hands the test
// the truth's `w`.
import { afterAll, expect, test } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { boot, type Row, type Scene, type Truth, type W } from '#engine/engine.ts'
import { load } from '#addons/scenemanager/scenemanager.addon.ts'
import { scenemanager } from '#plugins/scenemanager/scenemanager.sim.ts'
import { written } from '#plugins/loader/loader.sim.ts'
import type { Field } from '#plugins/terrain3d/terrain3d.sim.ts'
import { press, queue } from './motion3d.sim.ts'
import { clipOf, timesOf } from './motion3d.play.ts'

const DT = 1 / 60
const measure = (dur: number, forward = 0) => ({ dur, forward, left: 0, yaw: 0, travel: [[0, 0, 0, 0], [dur, forward, 0, 0]] })
// The feet on the floor, every frame of each clip.
const floor = { fps: 30, footL: [[0, 0.08, 0, 0, 0, 0.2]], footR: [[0, 0.08, 0, 0, 0, 0.2]], torso: [[0, 1, 0, 0, 1.5, 0]] }
const RIG = {
  clips: {
    idle: { loop: true }, walk: { loop: true, gear: 0, markers: { step: '50%' } }, backflip: { markers: { tuck: 0.3, strike: ['50%', '75%'] } }, bow: {}, aiming: { loop: true },
    fire: { markers: { shot: 0.1 } }, wave: {}, crawling: { loop: true }, low: { loop: true }, lighting: {}, stowing: {},
    shut: { markers: { x: ['75%', '25%'] } },
    flinch: { markers: { jolt: 0.1 } }, breathe: { loop: true },
  },
  roles: { still: 'idle' },
  table: {
    shut: measure(2), flinch: measure(0.6), breathe: measure(3),
    idle: measure(2), walk: measure(1, 1.4), backflip: measure(1.2), bow: measure(0.8), aiming: measure(1), fire: measure(0.5), wave: measure(1.5),
    crawling: measure(1.2, 0.6), low: measure(1.5), lighting: measure(0.8), stowing: measure(0.8),
  },
  ends: { figure: { idle: floor, walk: floor, backflip: floor, bow: floor, aiming: floor, fire: floor, wave: floor, crawling: floor, low: floor, lighting: floor, stowing: floor } },
}
// The crawl cube's activity, for the legs alone: still while the stick is let go, crawling while it is
// pushed. The cave's, for the arms alone: the torch drawn, held, and put away once the hold is over.
const CRAWL = {
  still: { target: 'triangles', clips: ['low'], when: ['ground', '!pushed'] },
  crawl: { target: 'triangles', clips: ['crawling'], when: ['ground', 'pushed'] },
}
const TORCH = {
  draw: { clips: ['lighting'], over: 'Spine', carry: 'torch', then: 'hold' },
  hold: { clips: [], over: 'Spine', carry: 'torch', then: 'putaway' },
  putaway: { clips: ['stowing'], over: 'Spine', carry: 'torch' },
}
// The walk's upper half: a held aim, a shot from it back to it, the aim let go by its key again, a wave.
const UPPER = {
  lower: { clips: [], over: 'Spine1', press: 'aim', from: ['aim'] },
  aim: { clips: ['aiming'], over: 'Spine1', press: 'aim' },
  fire: { clips: ['fire'], over: 'Spine1', press: 'fire', from: ['aim'], then: 'aim' },
  wave: { clips: ['wave'], over: 'Spine1', press: 'wave' },
}
const MOTION = {
  rig: 'rig.json', moves: 0.05, turns: 30,
  // A key cuts the backflip from half its length; any other one-shot a key played, at any time.
  buffer: { hold: 0.4, cancel: { emote: { '*': '50%' } } },
  carries: { torch: { prop: 'torch', anchor: { bone: 'LeftHand', at: [0, 0, 0], turn: [0, 0, 0], point: 'grip' }, limbs: [] } },
  activities: {
    walk: {
      normal: [0, 1, 0],
      motions: {
        walk: { target: 'triangles', clips: ['walk'], when: ['ground', 'pushed'] }, stand: { target: 'triangles', clips: ['idle'], when: ['ground', '!pushed'] }, ...UPPER,
        // Laid on top: a flinch by its key over anything, breathing at half weight while the stick is let go.
        flinch: { clips: ['flinch'], add: true, press: 'hit' },
        breathe: { clips: ['breathe'], add: true, when: ['!pushed'], weight: 0.5 },
      },
    },
    party: { motions: { emote: { clips: ['backflip'], press: 'emote' } } },
    show: { motions: { emote: { clips: ['bow'], press: 'emote', then: 'party.emote' } } },
    crawl: { motions: CRAWL },
    light_torch: { motions: TORCH },
  },
}
const NONE = { beginOffset: [0, 0, 0], endOffset: [0, 0, 0], beginTurn: 0 }
const BAKED = {
  held: {
    idle: { on: 'both' }, walk: { on: 'both' }, backflip: { on: 'both' }, bow: { on: 'both' }, aiming: { on: 'both', hold: 10 }, fire: { on: 'both', hold: 4 }, wave: { on: 'both' },
    crawling: { on: 'both' }, low: { on: 'both' }, lighting: { on: 'both' }, stowing: { on: 'both' },
  },
  offsets: { figure: { idle: NONE, walk: NONE, backflip: NONE, bow: NONE, aiming: NONE, fire: NONE, wave: NONE, crawling: NONE, low: NONE, lighting: NONE, stowing: NONE } },
}
const field: Field = {
  program: { world: 600, hscale: 1, sea: 0.5, flood: false, out: 'level', nodes: [{ id: 'level', op: 'const', value: 0 }] },
  analysis: { slopeStep: 1.5, curveStep: 4, positionRadius: 18, occlusionRadius: 30, occlusionSteps: 5, cliffProbe: 12, cliffSlope: 0.5, cliffDrop: 7, flatAngle: 0.03, records: 50000 },
  ground: { layers: [{ name: 'grass', map: 'grass', scale: 30 }] },
  surfaces: {},
  layers: [],
}
written('/motion3d-sim-test/rig.json', JSON.stringify(RIG))
written('/motion3d-sim-test/motion.json', JSON.stringify(MOTION))
written('/motion3d-sim-test/baked.json', JSON.stringify(BAKED))
written('/motion3d-sim-test/land.json', JSON.stringify(field))

const K = {
  triangles: { radius: 0.3, height: 1.8, step: 0.45, maxSlope: 0.9, slopeBand: 0.2, slide: 4, wade: 0.8, span: 0.3, probe: 0.5 },
  move: { accel: 12, turnRate: 12, still: 0.05 },
  fall: { gravity: 20, airAccel: 2 },
  jump: { jumpH: 1.1, jumpVelocityBoostMagnitude: 1 },
}
// The anywhere shape: a box at the middle of the world holding every point, offering walking.
const ANYWHERE = { shape: { box: { size: [1e9, 1e9, 1e9] } }, activities: ['walk'], priority: 0, data: { motion3d: { autoChange: true } } }
const PARTY = { pos: [6, -0.02, 0], size: [4, 0.04, 4] }
const STAGE = { pos: [7, -0.02, 0], size: [2, 0.04, 2] }
// A crawl cube ahead of the body and a cave behind it, each taking up its activity with no key.
const CUBE = { pos: [0, 0, 6], size: [4, 2, 4] }
const CAVE = { pos: [0, 0, -6], size: [4, 3, 4] }
const AUTO = { motion3d: { autoChange: true } }

const json = (url: string) => ({ type: 'json', url, preload: true })
const yard: Scene = {
  world: {
    seed: 3,
    loader: { assets: { rig: json('/motion3d-sim-test/rig.json'), motion: json('/motion3d-sim-test/motion.json'), baked: json('/motion3d-sim-test/baked.json'), land: json('/motion3d-sim-test/land.json') } },
    terrain3d: { field: 'land', rings: [{ reach: 64, seg: 256 }] },
    kinematics3d: { kinds: { body: K }, mods: { behaviors: ['shapes3d', 'terrain3d', 'motion3d'], states: ['motion3d'], solids: ['shapes3d'], footprints: ['shapes3d'] } },
    shapes3d: {
      kinds: {
        party: { shape: { box: { size: PARTY.size } }, activities: ['party'] },
        stage: { shape: { box: { size: STAGE.size } }, activities: ['show'], priority: 2 },
        cube: { shape: { box: { size: CUBE.size } }, activities: ['crawl'], priority: 2, data: AUTO },
        cave: { shape: { box: { size: CAVE.size } }, activities: ['light_torch'], priority: 2, data: AUTO },
      },
    },
    motion3d: {
      kinds: { body: { motion: 'motion', baked: 'baked', rig: 'rig', model: 'figure', fade: 0.2, blend: 'cross', reads: { pos: 'pos', yaw: 'yaw', vel: 'vel', grounded: 'grounded', limp: 'limp' }, lean: { most: 0.3, ease: 0.1 } } },
      anywhere: ANYWHERE,
      mods: { spaces: 'shapes3d' },
    },
  },
  prefabs: {
    engine: { dt: DT }, scenemanager: { out: {} }, loader: {},
    party: { pos: [0, 0, 0], yaw: 0 }, stage: { pos: [0, 0, 0], yaw: 0 }, cube: { pos: [0, 0, 0], yaw: 0 }, cave: { pos: [0, 0, 0], yaw: 0 },
    body: { limp: false },
    probe: {},
  },
  actors: [
    { is: 'scenemanager' }, { is: 'loader' },
    { is: 'party', pos: PARTY.pos }, { is: 'stage', pos: STAGE.pos }, { is: 'cube', pos: CUBE.pos }, { is: 'cave', pos: CAVE.pos },
    { is: 'body' }, { is: 'probe' },
  ],
  plugins: ['scenemanager'],
}
const top: Scene = {
  world: {}, plugins: ['scenemanager'], seats: 1,
  prefabs: { engine: { dt: DT }, scenemanager: { scenes: { yard: { file: 'yard.scene.json', suspend: false } }, dt: DT, entry: 'yard', port: 0 } },
  actors: [{ is: 'scenemanager' }],
}

const dir = mkdtempSync(join(tmpdir(), 'motion3d-sim-'))
afterAll(() => rmSync(dir, { recursive: true }))
const path = (p: string) => JSON.stringify(new URL(p, import.meta.url).pathname)
writeFileSync(join(dir, 'yard.scene.json'), JSON.stringify(yard))
writeFileSync(join(dir, 'yard.sim.ts'), `
import { scenemanager } from ${path('../scenemanager/scenemanager.sim.ts')}
import { loader } from ${path('../loader/loader.sim.ts')}
import { drive } from ${path('./motion3d.sim.ts')}
import file from './yard.scene.json' with { type: 'json' }
const body = { tick(me, dt, w) { drive(me, w, dt, [0, 0]) } }
export const sim = { scenemanager, loader, party: {}, stage: {}, cube: {}, cave: {}, body, probe: { after(_me, _dt, w) { globalThis.motion3dW = w } } }
export const scene = file
`)

async function open() {
  const t: Truth = (await load(boot(structuredClone(top), { scenemanager }), pathToFileURL(dir + '/').href)).get('yard')!
  t.step(DT)
  return { t, w: (globalThis as any).motion3dW as W, body: t.rows.find(r => r.kind === 'body')! }
}
const until = (t: Truth, done: () => boolean, most: number) => {
  for (let i = 0; i < most && !done(); i++) t.step(DT)
  expect(done()).toBe(true)
}
const steps = (seconds: number) => Math.round(seconds / DT)
// The key `emote` as the game hands it, the stick let go.
const emote = (body: Row, w: W): boolean => press(body, w, 'emote', [0, 0])

test('the key plays nothing on open ground; in the zone it plays the zone\'s clip with the body held still, then walks again', async () => {
  const { t, w, body } = await open()
  expect(emote(body, w)).toBe(false)
  expect(body.data.activity).toBe('walk')
  expect(body.data.clip).toBe('idle')

  // Walked into the party zone, short of the stage, playing the walk.
  body.data.want = [2, 0]
  until(t, () => body.data.pos[0] > PARTY.pos[0] - PARTY.size[0] / 2 + 0.5, steps(5))
  expect(body.data.clip).toBe('walk')
  body.data.want = [0, 0]
  t.step(DT)
  expect(body.data.offered).toEqual(['party'])

  expect(emote(body, w)).toBe(true)
  expect(body.data.activity).toBe('party')
  expect(body.data.clip).toBe('backflip')
  const at = [...body.data.pos]
  for (let i = 0; i < steps(RIG.table.backflip.dur) - 1; i++) {
    t.step(DT)
    expect(body.data.pos).toEqual(at)
    expect(body.data.activity).toBe('party')
  }
  until(t, () => body.data.activity === 'walk', 2)
  expect(body.data.space).toBe(null)

  // Stood under its feet over anim's fade, then walking on.
  until(t, () => body.data.eased === null, steps(0.2) + 1)
  body.data.want = [2, 0]
  t.step(DT)
  t.step(DT)
  expect(body.data.pos[0]).toBeGreaterThan(at[0])
})

test('where two zones hold the body, the key plays the higher priority one\'s', async () => {
  const { t, w, body } = await open()
  body.data.want = [2, 0]
  until(t, () => body.data.pos[0] > STAGE.pos[0], steps(6))
  body.data.want = [0, 0]
  t.step(DT)
  expect(body.data.offered).toEqual(['show', 'party'])

  expect(emote(body, w)).toBe(true)
  expect(body.data.activity).toBe('show')
  expect(body.data.clip).toBe('bow')
  // The bow's then names the party's emote, an activity of another shape: played once the bow is over.
  until(t, () => body.data.clip === 'backflip', steps(RIG.table.bow.dur) + 2)
  expect(body.data.activity).toBe('party')
})

const key = (body: Row, w: W, k: string): boolean => press(body, w, k, [0, 0])

test('a wave plays on the upper half alone while the body walks on beneath it, fades in, and lets go at its end', async () => {
  const { t, w, body } = await open()
  body.data.want = [2, 0]
  until(t, () => body.data.clip === 'walk', steps(1))
  expect(key(body, w, 'wave')).toBe(true)
  expect(body.data).toMatchObject({ upper: 'wave', upperBone: 'Spine1', upperW: 0, upperMotion: 'wave', motion: 'walk', clip: 'walk' })
  t.step(DT)
  expect(body.data.upperW).toBeCloseTo(DT / 0.2, 9)
  // Whole once its fade is done, the body walking on; faded out over the fade before its end.
  for (let i = 0; i < steps(1.5) - 2; i++) {
    t.step(DT)
    expect(body.data.clip).toBe('walk')
    expect(body.data.upper).toBe('wave')
    const left = 1.5 - body.data.upperT
    expect(body.data.upperW).toBeCloseTo(Math.min(1, (i + 2) * DT / 0.2, left / 0.2), 9)
  }
  until(t, () => body.data.upper === null, 2)
  expect(body.data.upperMotion).toBe(null)
  expect(body.data.clip).toBe('walk')
})

test('the aim holds on the upper half until its key again; a shot from it goes back to it; a zone that lists nothing for the arms keeps it', async () => {
  const { t, w, body } = await open()
  expect(key(body, w, 'fire')).toBe(false)
  expect(key(body, w, 'aim')).toBe(true)
  expect(body.data.upperMotion).toBe('aim')
  for (let i = 0; i < steps(2.5); i++) t.step(DT)
  expect(body.data).toMatchObject({ upper: 'aiming', upperW: 1, upperMotion: 'aim' })

  // A shot over the aim, the aim fading out beneath it as `was`, then the aim again.
  expect(key(body, w, 'fire')).toBe(true)
  expect(body.data).toMatchObject({ upper: 'fire', was: 'aiming', wasW: 1, upperMotion: 'fire' })
  until(t, () => body.data.upperMotion === 'aim', steps(0.5) + 1)
  expect(body.data.upper).toBe('aiming')

  // Its key again lets it go: it fades out as `was`.
  expect(key(body, w, 'aim')).toBe(true)
  expect(body.data).toMatchObject({ upper: null, was: 'aiming', upperMotion: null })
  until(t, () => body.data.was === null, steps(0.2) + 1)

  // Aimed again, then walked into the party zone and its key pressed: the party lists nothing for the
  // upper half, so the aim the anywhere shape gave it goes on over the backflip.
  expect(key(body, w, 'aim')).toBe(true)
  body.data.want = [2, 0]
  until(t, () => body.data.offered.includes('party'), steps(5))
  body.data.want = [0, 0]
  t.step(DT)
  expect(emote(body, w)).toBe(true)
  t.step(DT)
  expect(body.data).toMatchObject({ activity: 'party', upper: 'aiming', upperMotion: 'aim', upperActivity: 'walk' })
})

test('walked into the crawl cube it crawls once its stride comes round, lies still there with the stick let go, and walks out walking', async () => {
  const { t, body } = await open()
  const cube = t.rows.find(r => r.kind === 'cube')!.id
  body.data.want = [0, 2]
  until(t, () => body.data.pos[2] > CUBE.pos[2] - CUBE.size[2] / 2 + 0.2, steps(6))
  // Still walking as it comes in: the walk is over only as its clip comes round.
  expect(body.data).toMatchObject({ activity: 'walk', motion: 'walk' })
  until(t, () => body.data.activity === 'crawl', steps(RIG.table.walk.dur) + 2)
  expect(body.data).toMatchObject({ space: cube, motion: 'crawl', clip: 'crawling' })
  // The stick let go: the crawl's description stops being true, and the cube's still fits.
  body.data.want = [0, 0]
  until(t, () => body.data.motion === 'still', 3)
  expect(body.data).toMatchObject({ activity: 'crawl', clip: 'low' })
  // Out the back: the cube no longer holds it, so the anywhere shape's walk.
  body.data.want = [0, -2]
  until(t, () => body.data.motion === 'crawl', 3)
  until(t, () => body.data.activity === 'walk', steps(8))
  expect(body.data).toMatchObject({ space: null, motion: 'walk', clip: 'walk' })
  expect(body.data.pos[2]).toBeLessThan(CUBE.pos[2] - CUBE.size[2] / 2 + 0.5)
})

test('walked into the cave the arms draw the torch and hold it, the legs walking on beneath them; walked out, they put it away', async () => {
  const { t, body } = await open()
  const cave = t.rows.find(r => r.kind === 'cave')!.id
  body.data.want = [0, -2]
  until(t, () => body.data.upperMotion === 'draw', steps(6))
  expect(body.data).toMatchObject({ upperActivity: 'light_torch', upperSpace: cave, upper: 'lighting', upperBone: 'Spine', activity: 'walk', motion: 'walk' })
  until(t, () => body.data.upperMotion === 'hold', steps(RIG.table.lighting.dur) + 2)
  expect(body.data).toMatchObject({ upper: null, motion: 'walk', clip: 'walk' })
  // Turned round and out: the hold is over once the cave no longer holds the body, and its then puts the
  // torch away, which plays out with nothing after it.
  body.data.want = [0, 2]
  until(t, () => body.data.upperMotion === 'putaway', steps(8))
  expect(body.data).toMatchObject({ upper: 'stowing', activity: 'walk' })
  until(t, () => body.data.upperMotion === null, steps(RIG.table.stowing.dur) + 2)
  expect(body.data).toMatchObject({ upperActivity: null, upperSpace: null })
})

test('the clips\' markers reach the row the step they are crossed, and a blow lands only while its window is open', async () => {
  const { t, w, body } = await open()
  // A lap of the walk marks one step, at half the lap.
  body.data.want = [2, 0]
  until(t, () => body.data.clip === 'walk', steps(1))
  // Marked on exactly the steps whose playhead passes half the lap, however fast the walk plays.
  let stepped = 0
  for (let i = 0; i < steps(2); i++) {
    const was = body.data.clipT
    t.step(DT)
    const now = body.data.clipT
    const passed = now >= was ? was < 0.5 && 0.5 <= now : was < 0.5 || 0.5 <= now
    expect(body.data.markers.some((m: { name: string }) => m.name === 'step'), `step ${i}`).toBe(passed)
    if (passed) stepped++
    expect(body.data.windows).toEqual([])
  }
  expect(stepped).toBeGreaterThanOrEqual(2)
  until(t, () => body.data.offered.includes('party'), steps(5))
  body.data.want = [0, 0]
  t.step(DT)

  // The backflip: its tuck, then its strike window, the blow landing only while it is open.
  expect(emote(body, w)).toBe(true)
  const marked: string[] = []
  const landed: number[] = []
  until(t, () => {
    for (const m of body.data.markers) if (m.clip === 'backflip') marked.push(m.name)
    if (body.data.clip === 'backflip' && body.data.windows.includes('strike')) landed.push(body.data.clipT)
    return body.data.activity === 'walk'
  }, steps(RIG.table.backflip.dur) + 3)
  expect(marked).toEqual(['tuck', 'strike', 'strike.end'])
  expect(landed.length).toBe(steps(0.3))
  for (const at of landed) {
    expect(at).toBeGreaterThanOrEqual(0.6)
    expect(at).toBeLessThan(0.9)
  }

  // The upper half's markers reach the row as the body's do.
  expect(key(body, w, 'aim')).toBe(true)
  for (let i = 0; i < steps(0.5); i++) t.step(DT)
  expect(key(body, w, 'fire')).toBe(true)
  until(t, () => body.data.markers.some((m: { name: string; clip: string }) => m.name === 'shot' && m.clip === 'fire'), steps(0.2))
  expect(body.data.upperT).toBeGreaterThanOrEqual(0.1)
})

test('a key during the backflip plays nothing before its cancel point; queued, it plays there; a key nothing plays is dropped after its hold', async () => {
  const { t, w, body } = await open()
  body.data.want = [2, 0]
  until(t, () => body.data.offered.includes('party'), steps(5))
  body.data.want = [0, 0]
  t.step(DT)
  expect(emote(body, w)).toBe(true)
  t.step(DT)
  // Before half the backflip, the wave is refused.
  expect(key(body, w, 'wave')).toBe(false)
  queue(body, w, 'wave')
  expect(body.data.queued).toEqual([{ key: 'wave', age: 0 }])
  // Held, its seconds not counted, until the backflip has played half of itself, and played there.
  until(t, () => body.data.upperMotion === 'wave', steps(1))
  expect(body.data.clip).toBe('backflip')
  expect(body.data.clipT).toBeGreaterThanOrEqual(0.6)
  expect(body.data.clipT).toBeLessThan(0.6 + 2 * DT)
  expect(body.data.queued).toEqual([])

  // A key no move plays: dropped once it has been free to play for the hold, the wave on the upper half
  // not counting, nor the backflip before its cancel point.
  until(t, () => body.data.activity === 'walk' && body.data.upper === null, steps(2))
  queue(body, w, 'nothing')
  let held = 0
  until(t, () => {
    if (body.data.queued.length) held++
    return body.data.queued.length === 0
  }, steps(1))
  expect(held).toBe(Math.floor(0.4 / DT) + 1)
})

test('a flinch by its key is laid over the walk, the legs walking on, and taken off at its end; breathing is laid on while still', async () => {
  const { t, w, body } = await open()
  // Standing: breathing laid on, fading in to half its weight.
  until(t, () => body.data.adds.some((l: { name: string; w: number }) => l.name === 'walk.breathe' && l.w === 0.5), steps(0.5))
  // Walking: breathing let go, faded out and taken off.
  body.data.want = [2, 0]
  until(t, () => body.data.adds.length === 0, steps(1))
  until(t, () => body.data.clip === 'walk', steps(1))
  // The flinch over the walk, even before a one-shot's cancel point: the body walks on beneath it.
  expect(key(body, w, 'hit')).toBe(true)
  expect(body.data.adds).toEqual([{ name: 'walk.flinch', clip: 'flinch', t: 0, w: 0, most: 1, loop: false, ending: false, bone: null }])
  const at = body.data.pos[0]
  const marks: string[] = []
  until(t, () => {
    marks.push(...body.data.markers.map((m: { name: string }) => m.name))
    expect(body.data.clip).toBe('walk')
    return body.data.adds.length === 0
  }, steps(0.6) + 2)
  expect(marks).toContain('jolt')
  expect(body.data.pos[0]).toBeGreaterThan(at + 0.5)
})

test('a body turning as it walks leans into the turn, by the speed and the rate it turns, and stands up again going straight', async () => {
  const { t, body } = await open()
  body.data.want = [0, 2]
  until(t, () => body.data.clip === 'walk' && body.data.speed > 1, steps(2))
  for (let i = 0; i < steps(0.5); i++) t.step(DT)
  expect(Math.abs(body.data.lean)).toBeLessThan(1e-3)
  // Turning left (the want swung round toward +x and on): leaning into it, its head over the inside.
  let most = 0
  for (let i = 0; i < steps(1.5); i++) {
    const a = (i / steps(1.5)) * Math.PI
    body.data.want = [2 * Math.sin(a), 2 * Math.cos(a)]
    t.step(DT)
    most = Math.max(most, Math.abs(body.data.lean))
    if (Math.abs(body.data.lean) > 0.01) {
      // The body's up, tilted: toward the side it turns to.
      const [x, y, z, ww] = body.data.tilt
      const q = { x, y, z, w: ww }
      const up = [2 * (q.x * q.y - q.w * q.z), 1 - 2 * (q.x * q.x + q.z * q.z), 2 * (q.y * q.z + q.w * q.x)]
      // The turn's centre is to the side the facing (sin yaw, cos yaw) swings toward as the yaw grows.
      const side = [Math.cos(body.data.yaw), 0, -Math.sin(body.data.yaw)]
      expect(up[0] * side[0] + up[2] * side[2]).toBeGreaterThan(0)
    }
  }
  expect(most).toBeGreaterThan(0.05)
  expect(most).toBeLessThanOrEqual(0.3)
  // Straight again: upright.
  body.data.want = [0, -2]
  for (let i = 0; i < steps(1.5); i++) t.step(DT)
  expect(Math.abs(body.data.lean)).toBeLessThan(0.01)
})

test('queueing a key on a body whose motion3d file gives no buffer throws, naming it', async () => {
  const { w, body } = await open()
  const file = JSON.parse(JSON.stringify(MOTION))
  delete file.buffer
  written('/motion3d-sim-test/motion.json', JSON.stringify(file))
  try {
    expect(() => queue(body, w, 'wave')).toThrow('motion3d: body\'s motion3d file gives no buffer, which a queued key wave is held by')
  } finally {
    written('/motion3d-sim-test/motion.json', JSON.stringify(MOTION))
  }
})

test('a marker at a moment the bake did not measure, or a window that closes before it opens, throws naming it', async () => {
  const { w, body } = await open()
  const bad = { ...RIG, clips: { ...RIG.clips, idle: { loop: true, markers: { x: 'soon' } } } }
  expect(() => clipOf(bad as any, 'idle')).toThrow('motion3d: idle\'s marker x is at "soon", which is no seconds, "NN%" or one of peak, strike, takeoff, landing')
  expect(() => timesOf(w, body, 'shut')).toThrow('motion3d: shut\'s window x opens at 1.5 s, after it closes at 0.5 s')
})
