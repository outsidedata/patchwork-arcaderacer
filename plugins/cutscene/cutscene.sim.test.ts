// The server half of the cutscene on scenes this test writes: a loader holding a rig and the cue file,
// walker's table, anim, an audio ledger, scenemanager, the cutscene row on level ground unless a test hands
// it another, two marks (one named `constructor`), and three rows of a test kind `actor` that honours the cast contract, as a game's
// kind would: it obeys `direct` in its tick through walker's and anim's own functions, walks at the
// gear clip's speed or the pace, ignores its stick while directed, runs exactly its own step in
// `advance`, and moves its seat through scenemanager in `go` when it is a seat's body. Two of them are
// the cast; the third is a seat's body of a cast kind that is not in the cast.
//
// The scenes name audio's `play` in `world.cutscene.mods`, so the cutscene's sounds reach the ledger.
// The scenemanager's `prepare` loads the mods a scene names before its first step: here `load` of
// `stage`, a child whose `world.cutscene` names the same mod, loads it once before any test, and each
// scene booted after finds it, as a scene of the manager's would. The stage names two plugins of a
// game's own, `gates` and `later`, written into the test's folder, which deliver steps in their own
// words (Steps a game brings), so a scene that names them in `world.cutscene.mods.behaviors` plays them.
import { afterAll, beforeAll, expect, test } from 'vitest'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { boot, type Kind, type Row, type Scene, type Truth, type W } from '#engine/engine.ts'
import { load } from '#addons/scenemanager/scenemanager.addon.ts'
import { loader, written } from '#plugins/loader/loader.sim.ts'
import { seek, slide, walk, type Ground, type Numbers, type Solid } from '#plugins/walker/walker.sim.ts'
import { animate, clipOf, gesture, play, rigOf, type Measure, type Numbers as Anim, type Rig } from '#plugins/anim/anim.sim.ts'
import { audio, type Entry } from '#plugins/audio/audio.sim.ts'
import { scenemanager } from '#plugins/scenemanager/scenemanager.sim.ts'
import { check, cutscene, level, longest, mark, placed, pose, rooted, shaken, stepsOf, strangers, type Height, type Script } from './cutscene.sim.ts'

const DT = 1 / 60
// Level ground at height 0.
const LEVEL: Height = () => 0

// ---------------------------------------------------------------- the cast kind

// A pillar at (20, 0): a point inside it can never be reached.
const PILLAR: Solid = { x: 20, z: 0, radius: 1.5 }
const ground: Ground = {
  height: () => 0,
  solids: (x, z, r) => (Math.hypot(PILLAR.x - x, PILLAR.z - z) < PILLAR.radius + r ? [PILLAR] : []),
}

// One step of the actor: what `direct` says, or its stick when it is not directed.
function step(me: Row, dt: number, w: Parameters<NonNullable<Kind['tick']>>[2]) {
  const d = me.data
  const rig = rigOf(w, me.kind)
  const o = d.direct
  if (o) {
    if (o.play) {
      if (Object.hasOwn(rig.clips, o.play.clip)) play(me, o.play.clip, { holds: o.play.holds, rate: o.play.rate })
      delete o.play
    }
    if (o.gesture) {
      if (Object.hasOwn(rig.clips, o.gesture)) gesture(me, o.gesture)
      delete o.gesture
    }
    if (o.walk) {
      seek(me, w, o.walk.to, o.walk.stop, ground)
      const speed = o.walk.gear === null ? o.walk.pace : clipOf(rig, o.walk.gear).speed
      const m = Math.hypot(d.want[0], d.want[1])
      d.want = m ? [(d.want[0] / m) * speed, (d.want[1] / m) * speed] : [0, 0]
      d.face = null
    } else {
      d.want = [0, 0]
      d.face = o.face ? Math.atan2(o.face[0] - d.pos[0], o.face[1] - d.pos[2]) : null
    }
  } else {
    d.want = [d.stick[0] * 2, d.stick[1] * 2]
    d.face = null
  }
  walk(me, w, dt, ground)
  const { travel } = animate(me, w, dt)
  if (travel.move[0] || travel.move[1]) slide(me, w, travel.move, ground)
  d.yaw += travel.yaw
}

// Every `advance` the cast has been handed, so a skip's cost is counted in cast steps.
let advances = 0
const actor: Kind = {
  tick: step,
  acts: {
    advance(me, w, _seat, dt: number) {
      advances++
      step(me, dt, w)
    },
    go(me, w, _seat, scene: string, ...arrive) {
      if (typeof me.data.seat === 'number') w.call(w.find('scenemanager'), 'go', me.data.seat, scene, ...arrive)
    },
  },
}

// Starts the cutscene from its `before` on the step its `now` is set, as a game's rule does; with `again`
// set, resets it and starts it in the one step, as a game that plays it before every round does.
const starter: Kind = {
  before(me, _dt, w) {
    if (me.data.again) {
      me.data.again = false
      w.call(w.find('cutscene'), 'reset', -1)
      w.call(w.find('cutscene'), 'start', -1)
    }
    if (!me.data.now) return
    me.data.now = false
    w.call(w.find('cutscene'), 'start', -1)
  },
}

// ---------------------------------------------------------------- the scene

const table = (dur: number, forward = 0): Measure => ({ dur, forward, left: 0, yaw: 0, travel: [[0, 0, 0, 0], [dur, forward, 0, 0]] })
const RIG: Rig = {
  clips: { idle: { loop: true }, walk: { loop: true, gear: 0 }, jog: { loop: true, gear: 0 }, wave: {}, kneel: {}, nod: {} },
  roles: { still: 'idle' },
  table: { idle: table(2), walk: table(1, 1.5), jog: table(0.8, 2.4), wave: table(1.5), kneel: table(1), nod: table(0.6) },
}
const RIG_URL = 'test/cutscene/rig.json'
written(RIG_URL, JSON.stringify(RIG))
const ANIM: Anim = { still: 0.05, shift: 0.75, leap: 0.5, landFall: 7.5, moves: 0.05, turns: 30, kinds: { actor: { rig: 'rig', model: 'model', fade: 0.2, reads: { pos: 'pos', yaw: 'yaw', vel: 'vel', grounded: 'grounded', limp: 'limp' } } } }
const WALKER: Numbers = {
  radius: 0.35, height: 1.7, accel: 14, turnRate: 12, gravity: 20, jumpH: 0.9, step: 0.55, maxSlope: 0.5,
  slopeBand: 0.1, slide: 3, wade: 1, span: 0.7, probe: 1, seekSpeed: 1.4,
}
const TREMOR = [[1, 31], [0.6, 47], [0.3, 23]]

const CAST = { paladin: { kind: 'actor', name: 'paladin' }, dummy: { kind: 'actor', name: 'middle' } }
const base = (cues: Record<string, unknown>[], more: Record<string, unknown> = {}) =>
  ({ end: 10, auto: true, reach: 1.4, stop: 0.2, head: 1.5, fov: 45, pace: 1.4, limit: 20, cast: CAST, cues, ...more })

// The scenes' `world.cutscene.mods`: audio sounds the cues.
const MODS = { play: 'audio' }

// A manager and its one child, `stage`, naming the scenes' mods, written where `load` finds them and
// loaded before any test.
const TOP: Scene = {
  prefabs: { engine: { dt: DT }, scenemanager: { scenes: { stage: { file: 'stage.scene.json', suspend: false } }, dt: DT, entry: 'stage', port: 0 } },
  actors: [{ is: 'scenemanager' }],
  plugins: ['scenemanager'],
  seats: 1,
}
const dir = mkdtempSync(join(tmpdir(), 'cutscene-sim-'))
afterAll(() => rmSync(dir, { recursive: true }))

// Two plugins of a game's own that deliver the cutscene steps in its words (Steps a game brings), as
// a game's `plugins/<a>/<a>.cutscene.ts` would. gates' `open` swings a door open over `over`
// seconds, which a wait `on` it holds for; `spawn` makes a mark at a place, on a skip too; `boom`
// counts only the booms heard, none on a skip; its `shake` takes the place of cutscene's own. later's
// `open` takes the place of gates'.
const GATES = `
export const behaviors = () => ({
  open: {
    fields: { door: 'target', over: 'positive' },
    fire: ({ me, cue, state, on }) => { state.door = on(cue.door); state.at = me.data.e; state.over = cue.over },
    wait: {
      holds: d => d.steps.open !== undefined && d.e < d.steps.open.at + d.steps.open.over,
      longest: file => Math.max(0, ...file.cues.filter(c => c.do === 'open').map(c => c.over)),
    },
  },
  spawn: {
    fields: { name: 'text', where: 'target' },
    fire: ({ w, cue, on }) => { w.spawn('mark', { name: cue.name, at: on(cue.where) }) },
  },
  boom: {
    fields: {},
    fire: ({ state, loud }) => { if (loud) state.heard = (state.heard ?? 0) + 1 },
  },
  shake: {
    fields: { amp: 'number' },
    fire: ({ state, cue }) => { state.amp = cue.amp },
  },
})
`
const LATER = `
export const behaviors = () => ({
  open: { fields: { door: 'target' }, fire: ({ state }) => { state.later = true } },
})
`
for (const [a, text] of [['gates', GATES], ['later', LATER]]) {
  mkdirSync(join(dir, 'plugins', a), { recursive: true })
  writeFileSync(join(dir, 'plugins', a, `${a}.cutscene.ts`), text)
}
// The world of a scene naming them, its own plugins found from the test's folder.
const OURS = { shipped: { plugins: ['gates', 'later'] }, scenemanager: { home: pathToFileURL(dir + '/').href } }
const behaviors = (...names: string[]) => ({ numbers: { mods: { ...MODS, behaviors: names } }, world: OURS })

writeFileSync(join(dir, 'stage.scene.json'), JSON.stringify({
  world: { cutscene: { mods: { ...MODS, behaviors: ['gates', 'later'] } }, shipped: OURS.shipped },
  prefabs: { engine: { dt: DT }, scenemanager: { out: {} } },
  actors: [{ is: 'scenemanager' }],
  plugins: ['scenemanager'],
}))
writeFileSync(join(dir, 'stage.sim.ts'), `
import { scenemanager } from ${JSON.stringify(new URL('../scenemanager/scenemanager.sim.ts', import.meta.url).pathname)}
import file from './stage.scene.json' with { type: 'json' }
export const sim = { scenemanager }
export const scene = file
`)
beforeAll(async () => { await load(boot(structuredClone(TOP), { scenemanager }), pathToFileURL(dir + '/').href) })

// One url per file object, so two stages of one file are one scene.
const urls = new Map<unknown, string>()
type Stage = {
  numbers?: Record<string, unknown>; ahead?: boolean; twice?: boolean; rows?: ({ is: string } & Record<string, unknown>)[]
  height?: (w: W, x: number, z: number) => number
  world?: Record<string, unknown>
}
function stage(file: unknown, { numbers = {}, ahead = false, twice = false, rows = [], height = () => 0, world = {} }: Stage = {}): Truth {
  const url = urls.get(file) ?? `test/cutscene/${urls.size + 1}.json`
  urls.set(file, url)
  written(url, JSON.stringify(file))
  const paladin = { is: 'actor', name: 'paladin', seat: 0, pos: [0, 0, 0] }
  const scene: Scene = {
    world: { anim: ANIM, cutscene: { script: 'intro', kinds: ['actor'], settle: 4, tremor: TREMOR, mods: MODS, ...numbers }, audio: { hold: 0.25 }, walker: { kinds: { actor: WALKER } }, loader: { assets: { rig: { type: 'json', url: RIG_URL, preload: true }, intro: { type: 'json', url, preload: true } } }, ...world },
    prefabs: {
      loader: {},
      audio: { step: 0, next: 1, live: [] },
      // A child's row, as a manager naming these scenes loads it.
      scenemanager: { out: {}, names: ['here', 'alps'] },
      cutscene: {},
      mark: { name: '', at: [0, 0] },
      starter: { now: false },
      actor: {
        name: '', seat: null, stick: [0, 0], direct: null,
        pos: [0, 0, 0], yaw: 0, vel: [0, 0, 0], grounded: true, sliding: false, speed: 0, want: [0, 0], face: null, jump: false, side: 0, turned: 0,
      },
    },
    actors: [
      { is: 'loader' }, { is: 'audio' }, { is: 'scenemanager' },
      ...(ahead ? [paladin] : []),
      { is: 'cutscene' },
      ...(twice ? [{ is: 'cutscene' }] : []),
      { is: 'starter' },
      { is: 'mark', name: 'clearing', at: [6, 8] },
      { is: 'mark', name: 'constructor', at: [-4, 2, 3] },
      ...(ahead ? [] : [paladin]),
      { is: 'actor', name: 'middle', pos: [3, 0, 10], yaw: Math.PI },
      { is: 'actor', name: 'stranger', seat: 1, pos: [-6, 0, -6] },
      ...rows,
    ],
  }
  return boot(scene, { loader, audio, scenemanager, cutscene: cutscene(height), mark, starter, actor })
}

const row = (t: Truth, kind: string, name?: string) => t.rows.find(r => r.kind === kind && (name === undefined || r.data.name === name))!
const cs = (t: Truth) => row(t, 'cutscene').data
const live = (t: Truth): Entry[] => row(t, 'audio').data.live
const flat = (a: number[], b: number[]) => Math.hypot(a[0] - b[0], a[a.length - 1] - b[b.length - 1])
// Steps until the cutscene is done, at most `most` steps; the number of steps taken.
const toEnd = (t: Truth, most = 6000) => {
  let n = 0
  while (!cs(t).done && n < most) { t.step(DT); n++ }
  return n
}
// Every cue a step raised through the ledger: [ledger step, cue].
const heard = (t: Truth, steps: number) => {
  const got: [number, string][] = []
  for (let n = 0; n < steps; n++) {
    t.step(DT)
    const now = row(t, 'audio').data.step
    for (const e of live(t)) if (e.step === now) got.push([e.step, e.cue])
  }
  return got
}
const sound = (at: number, cue: string, more: Record<string, unknown> = {}) => ({ at, do: 'sound', cue, ...more })

// ---------------------------------------------------------------- the cue clock

test('cues are stable-sorted by at, fire on the first step t reaches them, and in authored order within a step', () => {
  const t = stage(base([sound(0.5, 'x'), sound(0.2, 'a'), sound(0.5, 'y'), sound(0.25, 'b'), sound(0, 'zero'), sound(0.2, 'a2')]))
  // The ledger counts the steps and is listed ahead of the cutscene, so an entry's step is the step it
  // fired on; the cutscene starts on step 1, whose e and t are one dt.
  expect(heard(t, 40)).toEqual([[1, 'zero'], [12, 'a'], [12, 'a2'], [15, 'b'], [30, 'x'], [30, 'y']])
  expect(cs(t).fired).toBe(6)
})

test('three sounds in one step make three ledger entries, at a point, at a mark, from a cast member and with no place', () => {
  const t = stage(base([sound(0.1, 'one', { where: [1, 2, 3] }), sound(0.1, 'two', { where: 'clearing' }), sound(0.1, 'three', { who: 'dummy' }), sound(0.1, 'four')]))
  for (let n = 0; n < 6; n++) t.step(DT)
  const dummy = row(t, 'actor', 'middle')
  expect(live(t)).toEqual([
    { id: 1, cue: 'one', at: [1, 2, 3], step: 6 },
    { id: 2, cue: 'two', at: [6, 0, 8], step: 6 },
    { id: 3, cue: 'three', at: dummy.data.pos, from: dummy.id, step: 6 },
    { id: 4, cue: 'four', step: 6 },
  ])
})

test('a scene that names no play plays no sound: its sounds and voices fire, and the ledger is never written', () => {
  const cues = [
    sound(0.1, 'one', { where: [1, 2, 3] }), sound(0.1, 'two', { who: 'dummy' }), sound(0.1, 'three'),
    { at: 0.2, do: 'say', who: 'dummy', text: 'Rise.', for: 1, voice: 'rise' },
  ]
  for (const numbers of [{ mods: {} }, { mods: undefined }]) {
    const t = stage(base(cues), { numbers })
    for (let n = 0; n < 15; n++) t.step(DT)
    expect(cs(t).fired).toBe(4)
    expect(cs(t).line).toMatchObject({ who: 'dummy', text: 'Rise.' })
    expect(row(t, 'audio').data.next).toBe(1)
    expect(live(t)).toEqual([])
  }
  // The same scene naming audio's play hears all four.
  const t = stage(base(cues))
  for (let n = 0; n < 15; n++) t.step(DT)
  expect(live(t).map(e => e.cue)).toEqual(['one', 'two', 'three', 'rise'])
})

test('a wait holds t at its at while e runs on, and every later cue shifts by exactly the hold', () => {
  const cues = (wait: boolean) => base([
    { at: 0, do: 'walk', who: 'paladin', to: 'clearing', gear: 'walk' },
    sound(0.4, 'before'),
    sound(0.5, 'ahead'),
    ...(wait ? [{ at: 0.5, do: 'wait', who: 'paladin' }] : []),
    sound(0.5, 'behind'),
    sound(1, 'after'),
  ])
  const free = heard(stage(cues(false)), 1200)
  expect(free).toEqual([[24, 'before'], [30, 'ahead'], [30, 'behind'], [60, 'after']])

  const t = stage(cues(true))
  const got: [number, string][] = []
  let reached = 0, released = 0
  for (let n = 1; n <= 1200; n++) {
    const was = cs(t).wait
    t.step(DT)
    const d = cs(t)
    if (!was && d.wait) {
      reached = n
      expect(d.wait).toEqual({ cue: 3, since: d.e })
      expect(d.t).toBe(0.5)
    }
    if (was && d.wait) expect(d.t).toBe(0.5)
    if (was && !d.wait) {
      released = n
      // On the step it lets go, t stays at its at.
      expect(d.t).toBe(0.5)
      expect(d.walks.paladin).toBeUndefined()
    }
    for (const e of live(t)) if (e.step === n) got.push([n, e.cue])
  }
  expect(reached).toBe(30)
  const hold = released - reached
  // A 10 m walk at 1.5 m/s holds for seconds.
  expect(hold).toBeGreaterThan(300)
  expect(got).toEqual([[24, 'before'], [30, 'ahead'], [released, 'behind'], [60 + hold, 'after']])
  // e − t is the time the wait held.
  expect((cs(t).e - cs(t).t) / DT).toBeCloseTo(hold, 6)
})

test('a wait with nothing to wait for passes at once, and a wait on the line holds until the line has gone', () => {
  const t = stage(base([
    { at: 0.1, do: 'wait', who: 'dummy' },
    sound(0.1, 'passed'),
    { at: 0.2, do: 'wait', who: 'line' },
    sound(0.2, 'no line'),
    { at: 0.3, do: 'say', who: 'dummy', text: 'Rise.', for: 1 },
    { at: 0.3, do: 'wait', who: 'line' },
    sound(0.3, 'line gone'),
  ]))
  expect(heard(t, 200)).toEqual([[6, 'passed'], [12, 'no line'], [18 + 60, 'line gone']])
})

test('a wait that falls between two steps counts the part of a step t passed it by into the hold, and every later cue fires on the first step e reaches its at plus the holds', () => {
  const t = stage(base([
    { at: 0, do: 'walk', who: 'paladin', to: [0, 3], gear: 'walk' },
    // 0.51 lies between steps 30 (0.5) and 31 (0.5167).
    { at: 0.51, do: 'wait', who: 'paladin' },
    sound(0.51, 'held'),
    sound(0.6, 'a'),
    sound(1.005, 'b'),
  ]))
  const e: number[] = [0]
  const got: Record<string, number> = {}
  let reached = 0, released = 0
  for (let n = 1; n <= 600; n++) {
    const was = cs(t).wait
    t.step(DT)
    e.push(cs(t).e)
    if (!was && cs(t).wait) reached = n
    if (was && !cs(t).wait) released = n
    for (const x of live(t)) if (x.step === n) got[x.cue] = n
  }
  expect(reached).toBe(31)
  expect(released).toBeGreaterThan(reached)
  expect(got.held).toBe(released)
  // The hold is the steps it held and the sixth of a step t had passed 0.51 by when it was reached.
  const hold = cs(t).e - cs(t).t
  expect(hold).toBeCloseTo((released - 31) * DT + (31 * DT - 0.51), 9)
  for (const [cue, at] of [['a', 0.6], ['b', 1.005]] as const) {
    expect(e[got[cue]]).toBeGreaterThanOrEqual(at + hold - 1e-9)
    expect(e[got[cue] - 1]).toBeLessThan(at + hold - 1e-9)
  }
})

test('a wait at the end holds the end: the scene ends once t is at end with no wait holding it', () => {
  const t = stage(base([
    { at: 0.2, do: 'say', who: 'dummy', text: 'Wait.', for: 1 },
    { at: 0.5, do: 'wait', who: 'line' },
  ], { end: 0.5 }))
  let n = 0
  while (!cs(t).done && n < 600) { t.step(DT); n++ }
  // Said on step 12, the line goes on step 72, and the scene ends on that step, not on step 30.
  expect(n).toBe(72)
  expect(cs(t).t).toBe(0.5)
})

test('each step e moves on and the line expires, walks are judged and faces read again, then the cue clock', () => {
  const t = stage(base([
    { at: 0, do: 'say', who: 'paladin', text: 'Here.', for: 0.5 },
    { at: 0, do: 'walk', who: 'dummy', to: 'paladin', gear: null },
  ]))
  t.step(DT)
  expect(cs(t).line).toEqual({ who: 'paladin', text: 'Here.', until: DT + 0.5 })
  expect(cs(t).walks).toEqual({ dummy: { cue: 1, since: DT } })
  // The walk is to a cast member, so its stop is the file's reach, and it is walked at the pace.
  expect(row(t, 'actor', 'middle').data.direct.walk).toEqual({ to: [0, 0], gear: null, stop: 1.4, pace: 1.4 })
  for (let n = 0; n < 29; n++) t.step(DT)
  expect(cs(t).line).not.toBe(null)
  t.step(DT)
  expect(cs(t).line).toBe(null)
  // Walked at the pace: 1.4 m/s, eased in at walker's accel.
  const d = row(t, 'actor', 'middle').data
  expect(Math.hypot(d.vel[0], d.vel[2])).toBeCloseTo(1.4, 2)
})

// ---------------------------------------------------------------- walks and faces

test('a walk goes by walker.seek at the gear clip\'s speed, rereads a moving target each step and ends within reach of a cast member', () => {
  const t = stage(base([
    { at: 0, do: 'walk', who: 'paladin', to: [0, 30], gear: 'jog' },
    { at: 0, do: 'walk', who: 'dummy', to: 'paladin', gear: 'walk' },
  ]))
  for (let n = 0; n < 119; n++) t.step(DT)
  const paladin = row(t, 'actor', 'paladin').data, dummy = row(t, 'actor', 'middle').data
  const stood = [paladin.pos[0], paladin.pos[2]]
  t.step(DT)
  expect(Math.hypot(paladin.vel[0], paladin.vel[2])).toBeCloseTo(3, 3)
  // The dummy's walk is to where the paladin stood as the step began.
  expect(dummy.direct.walk.to).toEqual(stood)
  expect(stood).not.toEqual([paladin.pos[0], paladin.pos[2]])
  let n = 0
  while (cs(t).walks.dummy && n++ < 3000) t.step(DT)
  expect(cs(t).walks.dummy).toBeUndefined()
  expect(row(t, 'actor', 'middle').data.direct.walk).toBeUndefined()
  expect(flat(row(t, 'actor', 'middle').data.pos, row(t, 'actor', 'paladin').data.pos)).toBeLessThanOrEqual(1.4)
})

test('face does not stop a walk: the facing is held and taken once the walk is done, and null lets go', () => {
  const t = stage(base([
    { at: 0, do: 'walk', who: 'paladin', to: 'clearing', gear: 'walk' },
    { at: 0.5, do: 'face', who: 'paladin', to: 'dummy' },
    { at: 12, do: 'walk', who: 'dummy', to: [-3, 14], gear: 'walk' },
    { at: 30, do: 'face', who: 'paladin', to: null },
  ], { end: 40 }))
  for (let n = 0; n < 31; n++) t.step(DT)
  const p = () => row(t, 'actor', 'paladin').data
  expect(cs(t).faces).toEqual({ paladin: 1 })
  expect(cs(t).walks.paladin).toEqual({ cue: 0, since: DT })
  const before = flat(p().pos, [6, 8])
  for (let n = 0; n < 60; n++) t.step(DT)
  // Still walking toward the clearing, not turned to the dummy.
  expect(p().direct.walk).toBeDefined()
  expect(flat(p().pos, [6, 8])).toBeLessThan(before - 1)
  expect(Math.abs(p().yaw - Math.atan2(6, 8))).toBeLessThan(0.01)
  let n = 0
  while (cs(t).walks.paladin && n++ < 3000) t.step(DT)
  expect(flat(p().pos, [6, 8])).toBeLessThanOrEqual(0.2)
  for (let k = 0; k < 120; k++) t.step(DT)
  // Turned to the dummy's feet, reread each step.
  expect(p().direct.face).toEqual([3, 10])
  expect(p().yaw).toBeCloseTo(Math.atan2(3 - p().pos[0], 10 - p().pos[2]), 3)
  // The dummy walks off, and the face goes with it, read again each step.
  while (cs(t).t < 13) t.step(DT)
  const dummy = row(t, 'actor', 'middle').data
  const stood = [dummy.pos[0], dummy.pos[2]]
  t.step(DT)
  expect(p().direct.face).toEqual(stood)
  expect(stood).not.toEqual([3, 10])
  while (cs(t).t < 30) t.step(DT)
  expect(cs(t).faces).toEqual({})
  expect(p().direct.face).toBeUndefined()
})

test('a limit ends a walk that can never arrive, where it stands, and lets its wait go on that step', () => {
  const t = stage(base([
    { at: 0, do: 'walk', who: 'dummy', to: [20, 0], gear: 'walk', limit: 16 },
    { at: 0, do: 'wait', who: 'dummy' },
    sound(0, 'after'),
  ]))
  const got = heard(t, 1100)
  // Begun on step 1 at e = dt, it ends on the first step 16 s of e later, pressed against the pillar.
  expect(got).toEqual([[961, 'after']])
  expect(cs(t).walks).toEqual({})
  const d = row(t, 'actor', 'middle').data
  expect(d.direct.walk).toBeUndefined()
  expect(flat(d.pos, [20, 0])).toBeGreaterThan(PILLAR.radius)
  expect(flat(d.pos, [20, 0])).toBeLessThan(PILLAR.radius + WALKER.radius + 0.5)
  // It stands, since nothing walks it any more.
  for (let n = 0; n < 120; n++) t.step(DT)
  expect(Math.hypot(d.vel[0], d.vel[2])).toBeLessThan(1e-6)
  expect(d.want).toEqual([0, 0])
  // The file's limit ends a walk that gives none.
  const f = stage(base([{ at: 0, do: 'walk', who: 'dummy', to: [20, 0], gear: 'walk' }, { at: 0, do: 'wait', who: 'dummy' }, sound(0, 'after')], { limit: 1 }))
  expect(heard(f, 100)).toEqual([[61, 'after']])
})

test('play and gesture are written on the member for its kind to start once; a clip the rig lacks is deleted unplayed', () => {
  const t = stage(base([
    { at: 0, do: 'play', who: 'dummy', clip: 'kneel', holds: true, rate: 1.5 },
    { at: 0, do: 'gesture', who: 'paladin', clip: 'nod' },
    { at: 0.5, do: 'play', who: 'paladin', clip: 'somersault', holds: false, rate: 1 },
  ]))
  t.step(DT)
  const dummy = row(t, 'actor', 'middle').data, paladin = row(t, 'actor', 'paladin').data
  expect(dummy.direct).toEqual({})
  expect(dummy.clip).toBe('kneel')
  expect(dummy.holds).toBe(true)
  expect(dummy.rate).toBe(1.5)
  expect(paladin.upper).toBe('nod')
  for (let n = 0; n < 30; n++) t.step(DT)
  expect(paladin.direct).toEqual({})
  expect(paladin.clip).toBe('idle')
})

// ---------------------------------------------------------------- shots, fades, bars, shake

test('fades and bars ramp straight from where they stand to their to over their over on e; a cut of either is at once', () => {
  const t = stage(base([
    { at: 0, do: 'fade', to: 1, over: 0 },
    { at: 0, do: 'bars', on: true, over: 1 },
    { at: 0.5, do: 'fade', to: 0, over: 2 },
    { at: 0.5, do: 'bars', on: false, over: 0.5 },
  ]))
  t.step(DT)
  expect(cs(t).fade).toEqual({ from: 0, to: 1, at: DT, over: 0 })
  expect(level(cs(t).fade, cs(t).e)).toBe(1)
  expect(level(cs(t).bars, cs(t).e)).toBe(0)
  for (let n = 0; n < 29; n++) t.step(DT)
  const d = cs(t)
  // The bars were 29 steps into a 1 s ramp when they turned back.
  expect(d.bars.from).toBeCloseTo(29 / 60, 12)
  expect(d.bars).toMatchObject({ to: 0, at: d.e, over: 0.5 })
  expect(d.fade).toMatchObject({ from: 1, to: 0, at: d.e, over: 2 })
  for (let n = 0; n < 60; n++) t.step(DT)
  expect(level(cs(t).fade, cs(t).e)).toBeCloseTo(0.5, 12)
  expect(level(cs(t).bars, cs(t).e)).toBe(0)
  expect(level(null, 3)).toBe(0)
})

test('a shot holds its view with fov and head filled in; the first is a cut from nothing, and the next dollies from the pose drawn as it fired', () => {
  const t = stage(base([
    { at: 0, do: 'shot', name: 'wide', pos: [0, 30, -30], look: 'clearing', over: 0 },
    { at: 0.5, do: 'shot', name: 'behind', pos: [0, 3, -5], look: 'paladin', follows: 'paladin', frame: 'body', over: 2, fov: 60 },
    { at: 0, do: 'walk', who: 'paladin', to: 'clearing', gear: 'walk' },
  ]))
  t.step(DT)
  expect(cs(t).shot).toEqual({ from: null, to: { pos: [0, 30, -30], look: 'clearing', fov: 45, head: 1.5 }, at: DT, over: 0 })
  for (let n = 0; n < 28; n++) t.step(DT)
  const was = pose(cs(t), t.rows, LEVEL)!
  expect(was.pos).toEqual([0, 30, -30])
  t.step(DT)
  const d = cs(t)
  expect(d.shot.to).toEqual({ pos: [0, 3, -5], look: 'paladin', fov: 60, head: 1.5, follows: 'paladin', frame: 'body' })
  expect(d.shot.from).toEqual(was)
  expect(d.shot).toMatchObject({ at: d.e, over: 2 })
  // At its start the dolly is the pose it fired from.
  expect(pose(d, t.rows, LEVEL)).toEqual(was)
})

test('a point stands on the ground as it is now: [x, z] on it and [x, up, z] up above it, a mark and a shot that follows nobody likewise, and ground raised under them raises them', () => {
  // A slope, raised by `lift` when the test raises it, as a brush raises the ground under a scene.
  let lift = 0
  const slope = (_w: W, x: number, z: number) => 0.25 * x - 0.1 * z + lift
  const at: Height = (x, z) => slope(undefined as unknown as W, x, z)
  const t = stage(base([
    { at: 0, do: 'shot', name: 'wide', pos: [0, 30, -30], look: 'clearing', over: 0 },
    sound(0.1, 'point', { where: [2, 5] }),
    sound(0.1, 'up', { where: [2, 1.5, 5] }),
    sound(0.1, 'mark', { where: 'constructor' }),
  ]), { height: slope })
  for (let n = 0; n < 6; n++) t.step(DT)
  expect(live(t).map(e => e.at)).toEqual([[2, at(2, 5), 5], [2, at(2, 5) + 1.5, 5], [-4, at(-4, 3) + 2, 3]])
  const wide = pose(cs(t), t.rows, at)!
  expect(wide.pos).toEqual([0, at(0, -30) + 30, -30])
  // It looks at the clearing's mark on the ground: its −z runs from the camera to the mark.
  const to = placed([6, 8], at)
  const dir = to.map((v, k) => v - wide.pos[k]), l = Math.hypot(...dir)
  const [x, y, z, w] = wide.quat
  const back = [2 * (x * z + w * y), 2 * (y * z - w * x), 1 - 2 * (x * x + y * y)]
  back.forEach((v, k) => expect(-v).toBeCloseTo(dir[k] / l, 9))
  // The ground raised 5 m under the scene: the camera and every place rise with it.
  lift = 5
  expect(pose(cs(t), t.rows, at)!.pos).toEqual([0, at(0, -30) + 30, -30])
  expect(pose(cs(t), t.rows, at)!.pos[1] - wide.pos[1]).toBeCloseTo(5, 12)
  // A world point and its point over the ground are one place.
  expect(rooted(placed([2, 1.5, 5], at), at)[1]).toBeCloseTo(1.5, 12)
  expect(placed([2, 5], at)).toEqual([2, at(2, 5), 5])
})

test('a shot\'s pos naming a cast member puts the camera at its head', () => {
  const t = stage(base([{ at: 0, do: 'shot', name: 'eyes', pos: 'dummy', look: 'clearing', over: 0 }]))
  t.step(DT)
  expect(pose(cs(t), t.rows, LEVEL)!.pos).toEqual([3, 1.5, 10])
})

test('a dolly keeps moving through a wait, on e, and ends on the view it was going to', () => {
  const t = stage(base([
    { at: 0, do: 'shot', name: 'wide', pos: [0, 30, -30], look: 'clearing', over: 0 },
    { at: 0, do: 'walk', who: 'paladin', to: 'clearing', gear: 'walk' },
    { at: 0.1, do: 'shot', name: 'down', pos: [2, 4, -6], look: 'clearing', over: 3 },
    { at: 0.1, do: 'wait', who: 'paladin' },
  ]))
  for (let n = 0; n < 6; n++) t.step(DT)
  expect(cs(t).wait).not.toBe(null)
  const seen: number[][] = []
  for (let n = 0; n < 200; n++) {
    t.step(DT)
    expect(cs(t).wait).not.toBe(null)
    expect(cs(t).t).toBe(0.1)
    seen.push(pose(cs(t), t.rows, LEVEL)!.pos)
  }
  // Every step of the 3 s dolly moved the camera, while t stood still.
  for (let i = 1; i < 174; i++) expect(Math.hypot(...seen[i].map((p, k) => p - seen[i - 1][k]))).toBeGreaterThan(1e-4)
  expect(seen[199]).toEqual([2, 4, -6])
})

test('a shake is the amp, decaying to nothing over its over, on world.cutscene\'s tremor, which the row does not carry', () => {
  const t = stage(base([{ at: 0.2, do: 'shake', over: 2, amp: 0.3 }]))
  for (let n = 0; n < 12; n++) t.step(DT)
  expect(cs(t).shake).toEqual({ at: cs(t).e, over: 2, amp: 0.3 })
  expect(cs(t).tremor).toBeUndefined()
  expect(shaken(cs(t), TREMOR)).toEqual(TREMOR.map(([weight, rate]) => 0.3 * weight * Math.sin(rate * cs(t).e)))
})

// ---------------------------------------------------------------- music, cast and marks

test('music is the row\'s music, and "" lets it go', () => {
  const t = stage(base([{ at: 0, do: 'music', name: 'theme' }, { at: 0.5, do: 'music', name: '' }]))
  t.step(DT)
  expect(cs(t).music).toBe('theme')
  for (let n = 0; n < 30; n++) t.step(DT)
  expect(cs(t).music).toBe(null)
})

test('the cast is matched by name when the scene starts, direct is {} from the start and null at the end, and the line clears', () => {
  const t = stage(base([{ at: 0, do: 'say', who: 'paladin', text: 'Go.', for: 5 }], { end: 1 }))
  expect(cs(t).running).toBeFalsy()
  t.step(DT)
  const paladin = row(t, 'actor', 'paladin'), middle = row(t, 'actor', 'middle'), stranger = row(t, 'actor', 'stranger')
  expect(cs(t).cast).toEqual({ paladin: paladin.id, dummy: middle.id })
  expect(cs(t).running).toBe(true)
  expect(paladin.data.direct).toEqual({})
  expect(middle.data.direct).toEqual({})
  expect(stranger.data.direct).toBe(null)
  // The stick is ignored while directed.
  paladin.data.stick = [0, 1]
  for (let n = 0; n < 30; n++) t.step(DT)
  expect(flat(paladin.data.pos, [0, 0])).toBe(0)
  toEnd(t)
  expect(cs(t)).toMatchObject({ running: false, done: true, line: null })
  expect(paladin.data.direct).toBe(null)
  expect(middle.data.direct).toBe(null)
  t.step(DT)
  expect(paladin.data.pos[2]).toBeGreaterThan(0)
})

test('a name is a cast member\'s before a mark\'s, looked up as own keys, so a mark named constructor is a mark', () => {
  const t = stage(base([{ at: 0, do: 'walk', who: 'paladin', to: 'constructor', gear: 'walk' }]))
  t.step(DT)
  expect(row(t, 'actor', 'paladin').data.direct.walk.to).toEqual([-4, 3])
  const named = stage({ ...base([{ at: 0, do: 'walk', who: 'dummy', to: 'clearing', gear: 'walk' }]), cast: { ...CAST, clearing: { kind: 'actor', name: 'paladin' } } })
  named.step(DT)
  expect(row(named, 'actor', 'middle').data.direct.walk.to).toEqual([0, 0])
})

test('when the scene starts a missing member, one listed ahead of the cutscene, a misspelt name and a second cutscene throw', () => {
  expect(() => stage({ ...base([]), cast: { ...CAST, ghost: { kind: 'actor', name: 'ghost' } } }).step(DT)).toThrow('no actor row is named ghost, for the cast member ghost')
  expect(() => stage(base([]), { ahead: true }).step(DT)).toThrow('the cast member paladin is listed ahead of the cutscene row')
  for (const [field, cue] of [['to', { at: 2, do: 'walk', who: 'paladin', to: 'clearnig', gear: 'walk' }], ['where', sound(3, 'x', { where: 'clearnig' })], ['look', { at: 0, do: 'shot', name: 'a', pos: [0, 1, 0], look: 'clearnig', over: 0 }]] as const) {
    expect(() => stage(base([cue])).step(DT), field).toThrow(`intro: cue 0 (${cue.do} at ${cue.at}): no cast member or mark is named clearnig`)
  }
  expect(() => stage({ ...base([]), cast: { ...CAST, box: { kind: 'crate', name: 'box' } } }).step(DT)).toThrow('the cast member box is a crate, which the cutscene\'s kinds do not name')
  expect(() => stage(base([]), { twice: true }).step(DT)).toThrow('a scene holds one cutscene, and this one holds 2')
})

test('a member whose row ends mid-scene is passed over: its cues do nothing, a wait on it passes and a walk to it ends', () => {
  const t = stage(base([
    { at: 0, do: 'walk', who: 'paladin', to: 'dummy', gear: 'walk' },
    { at: 0.5, do: 'play', who: 'dummy', clip: 'kneel', holds: true, rate: 1 },
    { at: 0.5, do: 'walk', who: 'dummy', to: 'clearing', gear: 'walk' },
    { at: 0.5, do: 'wait', who: 'dummy' },
    sound(0.5, 'on'),
    { at: 0.5, do: 'shot', name: 'on it', pos: [0, 2, -3], look: 'paladin', follows: 'dummy', over: 0 },
    { at: 0, do: 'face', who: 'paladin', to: 'dummy' },
  ]))
  for (let n = 0; n < 10; n++) t.step(DT)
  expect(cs(t).faces).toEqual({ paladin: 6 })
  t.end(row(t, 'actor', 'middle'))
  t.step(DT)
  expect(cs(t).walks).toEqual({})
  expect(cs(t).faces).toEqual({})
  expect(row(t, 'actor', 'paladin').data.direct).toEqual({})
  expect(heard(t, 30).map(([, c]) => c)).toEqual(['on'])
  expect(cs(t).shot).toBe(null)
  toEnd(t)
  expect(cs(t).done).toBe(true)
})

// ---------------------------------------------------------------- start, skip and end

test('the row\'s starts plays the scene from the first step its whole cast is there, as start would, and once', () => {
  const t = stage(base([sound(0, 'begun')], { auto: false, end: 1, cast: { ...CAST, late: { kind: 'actor', name: 'late' } } }))
  const id = row(t, 'cutscene').id
  t.step(DT)
  row(t, 'cutscene').data.starts = true
  for (let n = 0; n < 3; n++) t.step(DT)
  expect(cs(t).running).toBeFalsy()
  const late = t.spawn('actor', { name: 'late', pos: [9, 0, 9] })
  t.step(DT)
  expect(cs(t).running).toBe(true)
  expect(cs(t).cast.late).toBe(late.id)
  expect(cs(t).e).toBeCloseTo(DT, 12)
  toEnd(t)
  const e = cs(t).e
  for (let n = 0; n < 5; n++) t.step(DT)
  expect(t.rows.find(r => r.id === id)!.data).toMatchObject({ done: true, running: false, e })
})

test('strangers names every place a cue puts something at that is neither a cast member nor a mark', () => {
  const file = base([
    { at: 0, do: 'walk', who: 'paladin', to: 'nowhere', gear: null },
    { at: 0, do: 'shot', name: 'a', pos: 'clearing', look: 'dummy', over: 0 },
    { at: 1, do: 'shot', name: 'b', pos: [0, 1, 2], look: 'moon', follows: 'paladin', over: 0 },
    { at: 1, do: 'sound', cue: 'x', where: 'there' },
  ]) as unknown as Script
  expect(strangers(file, ['clearing'])).toEqual([
    { cue: 0, field: 'to', name: 'nowhere' },
    { cue: 2, field: 'look', name: 'moon' },
    { cue: 3, field: 'where', name: 'there' },
  ])
})

test('start is closed: a seat\'s start is refused, the game\'s call starts it, and a start while running or done does nothing', () => {
  const t = stage(base([sound(0, 'begun')], { auto: false, end: 1 }))
  const seat = t.open()
  const id = row(t, 'cutscene').id
  t.inbox(seat, { seq: 1, n: t.n, id, action: 'start', args: [] })
  t.step(DT)
  expect(cs(t).running).toBeFalsy()
  row(t, 'starter').data.now = true
  t.step(DT)
  expect(cs(t).running).toBe(true)
  for (let n = 0; n < 20; n++) t.step(DT)
  const e = cs(t).e
  row(t, 'starter').data.now = true
  t.step(DT)
  expect(cs(t).e).toBeCloseTo(e + DT, 12)
  toEnd(t)
  const ended = cs(t).e
  row(t, 'starter').data.now = true
  t.step(DT)
  expect(cs(t)).toMatchObject({ running: false, done: true, e: ended })
})

test('reset is closed and puts the row back as it stood before it started: a done scene plays again from its first cue, and one running stops with its cast let go', () => {
  const file = base([sound(0, 'begun'), sound(0.5, 'half')], { auto: false, end: 1 })
  const t = stage(file)
  const seat = t.open()
  row(t, 'starter').data.now = true
  t.step(DT)
  toEnd(t)
  expect(cs(t)).toMatchObject({ running: false, done: true })
  const id = row(t, 'cutscene').id
  t.inbox(seat, { seq: 1, n: t.n, id, action: 'reset', args: [] })
  t.step(DT)
  expect(cs(t).done).toBe(true)
  // The starter is listed after the cutscene row, so the scene it starts plays from the next step.
  row(t, 'starter').data.again = true
  t.step(DT)
  expect(cs(t)).toMatchObject({ running: true, done: false, fired: 0, e: 0, t: 0 })
  expect(row(t, 'actor', 'paladin').data.direct).toEqual({})
  t.step(DT)
  expect(cs(t).fired).toBe(1)
  expect(cs(t).e).toBeCloseTo(DT, 12)
  for (let n = 0; n < 40; n++) t.step(DT)
  expect(cs(t).fired).toBe(2)
  row(t, 'starter').data.again = true
  t.step(DT)
  expect(cs(t)).toMatchObject({ running: true, done: false, fired: 0, e: 0, t: 0, shot: null })
  t.step(DT)
  expect(cs(t).fired).toBe(1)
  toEnd(t)
  expect(cs(t)).toMatchObject({ running: false, done: true })
  expect(row(t, 'actor', 'paladin').data.direct).toBeNull()
})

// The scene every run below plays: shots, a dolly through waits, walks, faces, plays, a gesture, a
// line with a voice, sounds, a shake, fades, bars and music, and a go with arrive.
const RICH = base([
  { at: 0, do: 'shot', name: 'wide', pos: [0, 30, -30], look: 'clearing', over: 0 },
  { at: 0, do: 'bars', on: true, over: 1 },
  { at: 0, do: 'fade', to: 1, over: 0 },
  { at: 0, do: 'fade', to: 0, over: 2 },
  { at: 0, do: 'music', name: 'theme' },
  { at: 0.2, do: 'walk', who: 'paladin', to: 'clearing', gear: 'walk' },
  { at: 0.3, do: 'play', who: 'dummy', clip: 'kneel', holds: true, rate: 1 },
  { at: 0.5, do: 'shot', name: 'down', pos: [0, 3, -5], look: 'paladin', follows: 'paladin', frame: 'body', over: 3 },
  { at: 0.5, do: 'wait', who: 'paladin' },
  { at: 0.6, do: 'face', who: 'paladin', to: 'dummy' },
  { at: 0.6, do: 'say', who: 'paladin', text: 'Up.', for: 1.5, voice: 'hail' },
  { at: 0.6, do: 'gesture', who: 'paladin', clip: 'nod' },
  sound(0.7, 'rise', { where: 'dummy' }),
  { at: 0.8, do: 'wait', who: 'line' },
  { at: 0.9, do: 'walk', who: 'dummy', to: 'paladin', gear: null },
  { at: 0.9, do: 'shake', over: 1, amp: 0.2 },
  { at: 1, do: 'play', who: 'paladin', clip: 'wave', holds: false, rate: 1.2 },
  { at: 1.2, do: 'wait', who: 'dummy' },
  { at: 1.5, do: 'shot', name: 'close', pos: 'constructor', look: 'dummy', over: 1.5, fov: 60 },
  { at: 1.5, do: 'bars', on: false, over: 1 },
  { at: 2.5, do: 'face', who: 'paladin', to: null },
  { at: 2.5, do: 'music', name: 'calm' },
], { end: 4, go: 'alps', arrive: ['pad', 2] })

const skip = (t: Truth) => {
  const seat = t.open()
  t.inbox(seat, { seq: 1, n: t.n, id: row(t, 'cutscene').id, action: 'skip', args: [] })
}
const cast = (t: Truth) => JSON.stringify(['paladin', 'middle'].map(n => row(t, 'actor', n)))
const unskipped = (t: Truth) => JSON.stringify({ ...cs(t), skip: undefined })

test('a skip lands the cast and the row on the played end state byte for byte, raising no sound or voice as it plays through', () => {
  const played = stage(RICH)
  expect(toEnd(played)).toBe(777)
  // The voice and the sound were raised as it played.
  expect(row(played, 'audio').data.next).toBe(3)
  // Skipped on its first step, before its first wait, inside the walk the first wait holds for, and
  // inside the dummy's walk the third holds for.
  for (const at of [1, 20, 400, 550]) {
    const t = stage(RICH)
    for (let k = 0; k < at; k++) t.step(DT)
    const next = row(t, 'audio').data.next
    skip(t)
    t.step(DT)
    // The music cue at 2.5 is set as played, inside every skip's play-through.
    expect(cs(t)).toMatchObject({ done: true, running: false, skip: true, music: 'calm' })
    expect(cast(t)).toBe(cast(played))
    expect(unskipped(t)).toBe(unskipped(played))
    expect(row(t, 'scenemanager').data.out).toEqual(row(played, 'scenemanager').data.out)
    expect(row(t, 'audio').data.next).toBe(next)
  }
  // And they go on alike.
  const t = stage(RICH)
  for (let k = 0; k < 50; k++) t.step(DT)
  skip(t)
  t.step(DT)
  for (let k = 0; k < 90; k++) { t.step(DT); played.step(DT) }
  expect(cast(t)).toBe(cast(played))
})

test('a skip before the scene starts is not kept', () => {
  const t = stage({ ...RICH, auto: false })
  skip(t)
  t.step(DT)
  expect(cs(t).skip).toBeFalsy()
  row(t, 'starter').data.now = true
  t.step(DT)
  t.step(DT)
  expect(cs(t)).toMatchObject({ running: true, done: false })
  expect(cs(t).skip).toBeFalsy()
})

test('go sends every row of the kinds `kinds` names go(go, ...arrive) at the end, after a skip too', () => {
  const t = stage(RICH, { numbers: { settle: 0 } })
  for (let k = 0; k < 10; k++) t.step(DT)
  skip(t)
  t.step(DT)
  expect(cs(t)).toMatchObject({ done: true, running: false })
  expect(row(t, 'actor', 'paladin').data.direct).toBe(null)
  // The seat's body in the cast and the one that is not are both sent it.
  expect(row(t, 'scenemanager').data.out).toEqual({ 0: { scene: 'alps', args: ['pad', 2] }, 1: { scene: 'alps', args: ['pad', 2] } })
  const played = stage(RICH)
  toEnd(played)
  expect(row(played, 'scenemanager').data.out).toEqual(row(t, 'scenemanager').data.out)
})

// Whether two values are one, but for numbers no further apart than `by`.
const near = (a: unknown, b: unknown, by: number): boolean => {
  if (typeof a === 'number' && typeof b === 'number') return Math.abs(a - b) <= by
  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') return a === b
  const ka = Object.keys(a), kb = Object.keys(b)
  return ka.length === kb.length && ka.every(k => Object.hasOwn(b, k) && near((a as any)[k], (b as any)[k], by))
}

// With `settle` at a second, RICH's line, the second after its last shot and the tail to its end are
// each stepped for a second and leapt the rest. Walker eases its bodies by e^(−accel·s) and
// e^(−turnRate·s), so a second of steps leaves them under a micrometre a second from standing.
test('a skip steps each quiet stretch for settle seconds and leaps the rest, landing the row on the played end and the cast where it stands', () => {
  const played = stage(RICH)
  toEnd(played)
  const t = stage(RICH, { numbers: { settle: 1 } })
  t.step(DT)
  skip(t)
  advances = 0
  t.step(DT)
  expect(cs(t)).toMatchObject({ done: true, running: false, skip: true, music: 'calm' })
  // Fewer cast steps, for each of the two members, than playing it through takes.
  expect(advances / 2).toBeLessThan(toEnd(stage(RICH)) - 1)
  // The clocks and every time stamped on the row within a nanosecond, and the shots' poses, which
  // are drawn from the cast, within a micrometre.
  expect(Math.abs(cs(t).e - cs(played).e)).toBeLessThanOrEqual(1e-9)
  expect(Math.abs(cs(t).t - cs(played).t)).toBeLessThanOrEqual(1e-9)
  for (const k of ['fade', 'bars', 'shake'] as const) expect(near(cs(t)[k], cs(played)[k], 1e-9)).toBe(true)
  const but = (t: Truth) => ({ ...cs(t), skip: undefined })
  expect(near(but(t), but(played), 1e-6)).toBe(true)
  for (const name of ['paladin', 'middle']) {
    const [a, b] = [row(t, 'actor', name).data, row(played, 'actor', name).data]
    expect(near([a.pos, a.yaw, a.vel], [b.pos, b.yaw, b.vel], 1e-5)).toBe(true)
    expect([a.direct, a.grounded]).toEqual([b.direct, b.grounded])
  }
  expect(row(t, 'scenemanager').data.out).toEqual(row(played, 'scenemanager').data.out)
})

// A scene of eleven and a half days: a walk and a line in its first seconds, then a kneel ten seconds
// long half a day on, and cues days and ten days on. Played through it is sixty million steps;
// skipped it is one.
const NEVER = base([
  { at: 0, do: 'shot', name: 'wide', pos: [0, 30, -30], look: 'clearing', over: 0 },
  { at: 0.2, do: 'walk', who: 'paladin', to: 'clearing', gear: 'walk' },
  { at: 0.5, do: 'wait', who: 'paladin' },
  { at: 0.6, do: 'face', who: 'paladin', to: 'dummy' },
  { at: 0.6, do: 'say', who: 'paladin', text: 'Up.', for: 1.5, voice: 'hail' },
  { at: 0.8, do: 'wait', who: 'line' },
  { at: 43200, do: 'play', who: 'dummy', clip: 'kneel', holds: true, rate: 0.1 },
  { at: 200000, do: 'music', name: 'calm' },
  sound(900000, 'rise', { where: 'dummy' }),
], { end: 1e6, go: 'alps', arrive: ['pad', 2] })

test('a skip of a scene that runs for days ends it on the next step in a bounded number of cast steps, where it would end', () => {
  // Played for its first ten seconds: every hold it has is over, and the paladin stands facing the
  // dummy.
  const played = stage(NEVER)
  for (let k = 0; k < 600; k++) played.step(DT)
  expect(cs(played)).toMatchObject({ running: true, wait: null, fired: 6 })
  const t = stage(NEVER, { numbers: { settle: 1 } })
  t.step(DT)
  const next = row(t, 'audio').data.next
  skip(t)
  advances = 0
  const at = performance.now()
  t.step(DT)
  const took = performance.now() - at
  expect(cs(t)).toMatchObject({ done: true, running: false, fired: NEVER.cues.length, music: 'calm', line: null, wait: null, walks: {}, faces: {} })
  // Each of the two members: at most the walk's limit of steps, and a second of steps after each step
  // cues fire on: the first, the walk's end with its wait and the face, the line's wait, the play,
  // the music and the sound.
  expect(advances / 2).toBeLessThanOrEqual(Math.ceil(NEVER.limit / DT) + 6 * (60 + 1))
  expect(took).toBeLessThan(1000)
  // It ended on its end, the holds the played one had behind it.
  expect(cs(t).t).toBeGreaterThanOrEqual(NEVER.end - 1e-9)
  expect(cs(t).t).toBeLessThan(NEVER.end + DT)
  expect(Math.abs((cs(t).e - cs(t).t) - (cs(played).e - cs(played).t))).toBeLessThanOrEqual(1e-6)
  // The paladin stands where the played one does, turned to the dummy, and the dummy is kneeling.
  const [a, b] = [row(t, 'actor', 'paladin').data, row(played, 'actor', 'paladin').data]
  expect(near([a.pos, a.yaw], [b.pos, b.yaw], 1e-5)).toBe(true)
  expect(row(t, 'actor', 'middle').data).toMatchObject({ state: 'act', clip: 'kneel', holds: true, direct: null })
  expect(a.direct).toBe(null)
  expect(row(t, 'audio').data.next).toBe(next)
  expect(row(t, 'scenemanager').data.out).toEqual({ 0: { scene: 'alps', args: ['pad', 2] }, 1: { scene: 'alps', args: ['pad', 2] } })
})

test('two boots of one scene are byte-identical at every step', () => {
  const a = stage(RICH), b = stage(RICH)
  for (let k = 0; k < 700; k++) {
    a.step(DT)
    b.step(DT)
    expect(JSON.stringify(a.rows)).toBe(JSON.stringify(b.rows))
  }
})

// ---------------------------------------------------------------- check

test('check throws a sentence naming the file and the cue for a file it cannot play', () => {
  const fails = (file: unknown, message: string) => expect(() => check('intro', file as Script)).toThrow(message)
  const { end: _, ...noEnd } = base([])
  fails(noEnd, 'intro: end undefined is not a number at or above 0')
  fails(base([], { pace: 0 }), 'intro: pace 0 is not a number above 0')
  fails(base([{ at: 1, do: 'walk', who: 'paladin', to: 'clearing' }]), 'intro: cue 0 (walk at 1): gear undefined is not a clip or null')
  fails(base([{ at: 1, do: 'say', who: 'paladin', text: 'x' }]), 'intro: cue 0 (say at 1): for undefined is not a number above 0')
  fails(base([{ at: 1, do: 'play', who: 'nobody', clip: 'wave', holds: false, rate: 1 }]), 'intro: cue 0 (play at 1): who "nobody" is not a cast member')
  fails(base([{ at: 1, do: 'dance', who: 'paladin' }]), 'intro: cue 0 (dance at 1): dance is not a cue')
  fails(base([sound(0, 'a'), null as unknown as Record<string, unknown>]), 'intro: cue 1 (undefined at undefined): is not { at, do, ... }')
  fails(base([{ do: 'music', name: 'x' }]), 'intro: cue 0 (music at undefined): at undefined is not a number at or above 0')
  fails(base([{ at: 1, do: 'shot', name: 'a', pos: [0, 1, 0], look: 'clearing', over: 0, frame: 'body' }]), 'intro: cue 0 (shot at 1): a frame with no follows')
  fails(base([{ at: 1, do: 'shot', name: 'a', pos: 'clearing', look: 'clearing', over: 0, follows: 'paladin' }]), 'intro: cue 0 (shot at 1): pos "clearing" is not an offset [x, y, z] from the member it follows')
  fails(base([sound(1, 'a', { who: 'paladin', where: 'clearing' })]), 'intro: cue 0 (sound at 1): both where and who')
  // The first shot in at order, not in the file's, is the cut.
  fails(base([{ at: 2, do: 'shot', name: 'b', pos: [0, 1, 0], look: 'clearing', over: 0 }, { at: 1, do: 'shot', name: 'a', pos: [0, 1, 0], look: 'clearing', over: 1 }]),
    'intro: cue 1 (shot at 1): the first shot has an over, and before it the camera is not the cutscene\'s')
  fails({ ...base([]), cast: { line: { kind: 'actor', name: 'paladin' } } }, 'intro: a cast member named line, which a wait on the line would name')
  expect(() => check('intro', RICH as unknown as Script)).not.toThrow()
  // A file the scene plays is checked when the row reads it, and again when it is written.
  expect(() => stage(base([{ at: 1, do: 'dance', who: 'paladin' }])).step(DT)).toThrow('intro: cue 0 (dance at 1): dance is not a cue')
  const file = base([sound(5, 'a')])
  const t = stage(file)
  t.step(DT)
  written(urls.get(file)!, JSON.stringify(base([sound(5, 'a'), { at: 6, do: 'dance', who: 'paladin' }])))
  expect(() => t.step(DT)).toThrow('intro: cue 1 (dance at 6): dance is not a cue')
  // And a sound edited to an earlier at is heard at it: the order is read from the written file.
  const late = base([sound(5, 'late')], { end: 20 })
  const u = stage(late)
  u.step(DT)
  written(urls.get(late)!, JSON.stringify(base([sound(0.5, 'early'), sound(5, 'late')], { end: 20 })))
  expect(heard(u, 40).map(([, c]) => c)).toEqual(['early'])
})

// ---------------------------------------------------------------- steps a game brings

const opens = (more: Record<string, unknown>[] = [], over = 1) => base([{ at: 0.5, do: 'open', door: 'clearing', over }, ...more], { end: 3 })

test('a delivered step is checked as cutscene\'s own are, and fires on the step t reaches its at', () => {
  const t = stage(opens(), behaviors('gates'))
  for (let n = 0; n < 29; n++) t.step(DT)
  expect(cs(t).steps.open).toBeUndefined()
  t.step(DT)
  expect(cs(t).steps.open).toMatchObject({ door: [6, 8], over: 1 })
  expect(cs(t).steps.open.at).toBeCloseTo(0.5, 9)
  // Its fields are held to their rules, and a place it names to the cast and the marks.
  expect(() => stage(opens([], 0), behaviors('gates')).step(DT)).toThrow('intro: cue 0 (open at 0.5): over 0 is not a number above 0')
  const misspelt = base([{ at: 0.5, do: 'open', door: 'gaet', over: 1 }])
  expect(() => stage(misspelt, behaviors('gates')).step(DT)).toThrow('intro: cue 0 (open at 0.5): no cast member or mark is named gaet')
})

test('a word nothing delivers is refused, naming itself, and a scene that names the plugin plays it', () => {
  expect(() => stage(opens()).step(DT)).toThrow('intro: cue 0 (open at 0.5): open is not a cue: no plugin world.cutscene.mods.behaviors names delivers it')
  expect(() => stage(opens(), behaviors('gates')).step(DT)).not.toThrow()
})

test('a delivered word takes the place of cutscene\'s own only in a scene that names its plugin', () => {
  const file = base([{ at: 0.5, do: 'shake', over: 1, amp: 2 }])
  const theirs = stage(file, behaviors('gates'))
  for (let n = 0; n < 30; n++) theirs.step(DT)
  expect(cs(theirs).steps.shake).toEqual({ amp: 2 })
  expect(cs(theirs).shake).toBeNull()
  const ours = stage(file)
  for (let n = 0; n < 30; n++) ours.step(DT)
  expect(cs(ours).shake).toMatchObject({ over: 1, amp: 2 })
  expect(cs(ours).steps).toEqual({})
})

test('a later plugin\'s word takes the place of an earlier one\'s', () => {
  const later = stage(opens(), behaviors('gates', 'later'))
  for (let n = 0; n < 30; n++) later.step(DT)
  expect(cs(later).steps.open).toEqual({ later: true })
  const gates = stage(opens(), behaviors('later', 'gates'))
  for (let n = 0; n < 30; n++) gates.step(DT)
  expect(cs(gates).steps.open).toMatchObject({ door: [6, 8] })
})

test('a wait on a delivered step holds the cue clock while the step says so', () => {
  const file = opens([{ at: 0.5, do: 'wait', on: 'open' }, sound(0.5, 'after')])
  const t = stage(file, behaviors('gates'))
  // The door opens over a second from step 30, and the sound behind the wait is heard when it is open.
  const got = heard(t, 120)
  expect(got.length).toBe(1)
  expect(got[0][1]).toBe('after')
  expect(got[0][0]).toBeGreaterThanOrEqual(90)
  expect(got[0][0]).toBeLessThanOrEqual(91)
  expect(longest(file as unknown as Script, stepsOf(t.world))).toBe(4)
})

test('a skip plays delivered steps through: a spawn still happens, a boom is not heard, and a wait on a step lets go', () => {
  const file = opens([{ at: 0.5, do: 'wait', on: 'open' }, { at: 1, do: 'spawn', name: 'boss', where: [2, 3] }, { at: 1, do: 'boom' }])
  const played = stage(file, behaviors('gates'))
  toEnd(played)
  expect(row(played, 'mark', 'boss').data.at).toEqual([2, 3])
  expect(cs(played).steps.boom).toEqual({ heard: 1 })

  const skipped = stage(file, behaviors('gates'))
  skipped.step(DT)
  skip(skipped)
  skipped.step(DT)
  expect(cs(skipped).done).toBe(true)
  expect(row(skipped, 'mark', 'boss').data.at).toEqual([2, 3])
  expect(cs(skipped).steps.boom).toEqual({})
  expect(cs(skipped).steps.open).toEqual(cs(played).steps.open)
})
