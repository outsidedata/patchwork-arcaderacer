// The browser half of audio on a stand-in AudioContext, as a canvas is stood in for where there is
// no page. The stand-in keeps the graph each sound is wired into, what each AudioParam was set to and
// scheduled with, and, as each source starts, where the panner it plays through stood at that moment,
// or the pan and the gain after it of the stereo panner it plays through. The listener is a
// three.js camera as render3d's, or a stand-in render2d whose `project` is render2d's for a world
// drawn straight onto the stage at a zoom of 2, the camera looking at a point the test moves.
// The rows are a truth's: the ledger's server half and a `bell` kind that raises the sounds the test
// queues on it, stepped here, and each frame hands the page the rows as they stand, as a packet would.
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import * as THREE from 'three'
import { boot, type Kind, type Row, type Scene, type Truth } from '#engine/engine.ts'
import { audio as ledger, sound } from './audio.sim.ts'
import { audio } from './audio.plugin.ts'

const DT = 1 / 60

class Param {
  value: number
  events: (string | number)[][] = []
  constructor(v: number) { this.value = v }
  setTargetAtTime(v: number, t: number, c: number) { this.events.push(['target', v, t, c]) }
  linearRampToValueAtTime(v: number, t: number) { this.events.push(['ramp', v, t]) }
  setValueAtTime(v: number, t: number) { this.events.push(['set', v, t]) }
  cancelScheduledValues(t: number) { this.events.push(['cancel', t]) }
}
class Node {
  out?: Node
  connect(n: Node) { this.out = n; return n }
  disconnect() { this.out = undefined }
}
class Gain extends Node { gain = new Param(1) }
class Stereo extends Node { pan = new Param(0) }
class Panner extends Node {
  positionX = new Param(0); positionY = new Param(0); positionZ = new Param(0)
  distanceModel = 'inverse'; refDistance = 1; maxDistance = 10000; rolloffFactor = 1
  at() { return [this.positionX.value, this.positionY.value, this.positionZ.value] }
}
// Every node from one to the context's destination.
const chain = (n: Node | undefined): Node[] => (n ? [n, ...chain(n.out)] : [])
class Source extends Node {
  buffer: { name: string } | null = null
  loop = false
  playbackRate = new Param(1)
  onended: (() => void) | null = null
  loopStart = 0
  loopEnd = 0
  // Where its panner stood as it started, or null when it plays through none; and the same for its
  // stereo panner, as its pan and the gain after it.
  startedAt?: number[] | null
  startedPan?: number[] | null
  started?: number[] // what start was called with
  stopped?: number
  constructor(private ctx: Ctx) { super() }
  start(...args: number[]) {
    const p = chain(this).find(n => n instanceof Panner) as Panner | undefined
    this.startedAt = p ? p.at() : null
    this.startedPan = this.stereo ? [this.stereo.pan.value, this.fade!.gain.value] : null
    this.started = args
    this.ctx.started.push(this)
  }
  stop(when = 0) { this.stopped = when }
  // The sound has played to its end.
  end() { this.onended?.() }
  get panner() { return chain(this).find(n => n instanceof Panner) as Panner | undefined }
  get stereo() { return chain(this).find(n => n instanceof Stereo) as Stereo | undefined }
  // The gain a stereo panner goes out through: how far the sound has faded.
  get fade() { return this.stereo?.out as Gain | undefined }
  // Its pan and fade as they stand.
  get panned() { return [this.stereo!.pan.value, this.fade!.gain.value] }
  get gain() { return chain(this).find(n => n instanceof Gain) as Gain }
  get name() { return this.buffer!.name }
}
class Ctx {
  static state = 'running'
  static made: Ctx[] = []
  state = Ctx.state
  currentTime = 3
  destination = new Node()
  listener = {
    positionX: new Param(0), positionY: new Param(0), positionZ: new Param(0),
    forwardX: new Param(0), forwardY: new Param(0), forwardZ: new Param(-1),
    upX: new Param(0), upY: new Param(1), upZ: new Param(0),
  }
  started: Source[] = []
  resumed = 0
  changed: (() => void)[] = []
  constructor() { Ctx.made.push(this) }
  addEventListener(type: string, f: () => void) { if (type === 'statechange') this.changed.push(f) }
  // The page lets audio play: the context runs on its own.
  run() { this.state = 'running'; for (const f of this.changed) f() }
  createBufferSource() { return new Source(this) }
  createBuffer(_channels: number, length: number, sampleRate: number) {
    const data = new Float32Array(length)
    return { name: 'stream', length, sampleRate, data, getChannelData: () => data }
  }
  createGain() { return new Gain() }
  createPanner() { return new Panner() }
  createStereoPanner() { return new Stereo() }
  // A file's bytes are its name, as the test's loader hands them beside a gun's manifest.
  decodeAudioData(bytes: ArrayBuffer) {
    const name = new TextDecoder().decode(bytes)
    return Promise.resolve({ name, duration: SECONDS[name] ?? 1 })
  }
  resume() { this.resumed++; this.run(); return Promise.resolve() }
  close() { this.state = 'closed'; return Promise.resolve() }
  // The gain every sound goes through last: the volume.
  master() { return this.started.map(s => chain(s).at(-2) as Gain)[0] }
}

// The page's listeners, by event.
let on = new Map<string, () => void>()
beforeEach(() => {
  Ctx.state = 'running'
  Ctx.made = []
  on = new Map()
  vi.stubGlobal('AudioContext', Ctx)
  vi.stubGlobal('addEventListener', (type: string, f: () => void) => { on.set(type, f) })
  vi.stubGlobal('removeEventListener', (type: string, f: () => void) => { if (on.get(type) === f) on.delete(type) })
})
afterEach(() => { vi.unstubAllGlobals() })

const TABLE = {
  hold: 0.25,
  space: { model: 'linear', ref: 5, max: 40, rolloff: 1 },
  cues: {
    ding: { sounds: ['ding1', 'ding2', 'ding3'], gain: 0.5, rate: [0.8, 1.2] },
    far: { sounds: ['far'], gain: 1, range: 100 },
    saw: { sounds: ['saw'], gain: 1, cut: true },
    thud: { sounds: ['thud'], gain: 1 },
  },
  loops: {
    rain: { sound: 'rain', field: { kind: 'sky', path: 'mix.rain' }, over: [0.25, 0.75], gain: [0, 0.8] },
    wind: { sound: 'wind', listener: 'height', over: [0, 100], gain: [0.2, 1] },
    music: { named: { kind: 'sky', path: 'song' }, fade: 2 },
  },
  volume: { level: 'volume', muted: 'muted' },
}
const SOUNDS = ['ding1', 'ding2', 'ding3', 'far', 'saw', 'thud', 'rain', 'wind', 'a', 'b']

// Each step the bell raises what the test queued on it: a cue at its `at`, from itself, or with no
// place; or a round, from itself, `t` seconds into the step. It walks one metre along x a step while
// `walk` is set.
const bell: Kind = {
  tick(me, _dt, w) {
    const d = me.data
    for (const [cue, how, at, t] of d.queue) {
      if (how === 'at') sound(w, cue, at)
      if (how === 'from') sound(w, cue, undefined, me.id)
      if (how === 'bare') sound(w, cue)
      if (how === 'round') sound(w, cue, undefined, me.id, t)
    }
    d.queue = []
    if (d.walk) d.pos = [d.pos[0] + 1, d.pos[1], d.pos[2]]
  },
}
const sky: Kind = {}

const rig = (table: Record<string, unknown> = TABLE) => {
  const scene: Scene = {
    world: { audio: table },
    prefabs: {
      audio: { step: 0, next: 1, live: [] },
      bell: { queue: [], walk: false, pos: [0, 0, 0] },
      sky: { mix: { rain: 0 }, song: null },
    },
    actors: [{ is: 'audio' }, { is: 'bell' }, { is: 'bell', pos: [50, 0, 0] }],
  }
  const truth = boot(scene, { audio: ledger, bell, sky })
  const bells = truth.rows.filter(r => r.kind === 'bell')
  const ring = (i: number, cue: string, how = 'at', at: number[] = [0, 0, 0], t?: number) => bells[i].data.queue.push([cue, how, at, t])
  const step = (k = 1) => { for (let i = 0; i < k; i++) truth.step(DT) }
  return { truth, bells, ring, step }
}

// The canvas, and how many of its pixels a step of the 2D world is drawn across.
const W = 320, H = 240, ZOOM = 2

type Store = Record<string, unknown>
// `blank`: both renderers listed, in a scene that gives neither a prefab, so neither has a world.
type Listener = '3d' | '2d' | 'none' | 'blank'
const page = (truth: Truth, opts: { table?: Record<string, unknown>; store?: Store | null; landed?: string[]; listener?: Listener } = {}) => {
  const landed = new Set(opts.landed ?? SOUNDS)
  const asked: string[] = []
  const camera = new THREE.PerspectiveCamera()
  // render2d's camera: the world point in the middle of the canvas.
  const look = [0, 0]
  const render2d = {
    world: {},
    project: (pos: number[]) => ({ x: W / 2 + (pos[0] - look[0]) * ZOOM, y: H / 2 + (pos[1] - look[1]) * ZOOM, behind: false }),
  }
  const listener = opts.listener ?? '3d'
  const values = opts.store === undefined ? { volume: 1, muted: false } : opts.store
  const plugins: any = {
    wire: { scene: { world: { audio: opts.table ?? TABLE }, prefabs: { engine: { dt: DT, width: W, height: H } } }, rows: [] as Row[] },
    ...(listener === '3d' ? { render3d: { camera } } : listener === '2d' ? { render2d } : {}),
    ...(listener === 'blank' ? { render3d: { camera: undefined }, render2d: { world: undefined, project() { throw new Error('render2d has no world') } } } : {}),
    loader: {
      load: (name: string) => { asked.push(name); return new Promise(() => {}) },
      get: (name: string) => (landed.has(name) ? { name } : undefined),
    },
    ...(values ? { store: { get: (key: string) => { if (!(key in values)) throw new Error(`store has no ${key}`); return values[key] } } } : {}),
  }
  const me = audio()
  const ctx = Ctx.made.at(-1)
  const frame = () => {
    plugins.wire.rows = structuredClone(truth.rows)
    me.afterTick(plugins)
  }
  return { me, ctx: ctx!, camera, look, asked, frame, plugins, land: (name: string) => landed.add(name) }
}

// The sounds a page started, loops left out; and each as [sound, where its panner stood as it started].
const sounds = (ctx: Ctx) => ctx.started.filter(s => !s.loop)
const heard = (ctx: Ctx) => sounds(ctx).map(s => [s.name, s.startedAt])

test('every entry plays once, however many frames see it and however many steps pass between frames; the first snapshot is silent', () => {
  const { ring, step, truth } = rig()
  const p = page(truth)
  ring(0, 'thud', 'at', [-1, 0, 0])
  step()
  p.frame()
  p.frame()
  expect(heard(p.ctx)).toEqual([])
  // One a step, seen by three frames each; then two steps to a frame.
  for (let k = 1; k <= 4; k++) {
    ring(0, 'thud', 'at', [k, 0, 0])
    step()
    for (let f = 0; f < 3; f++) p.frame()
  }
  for (let k = 5; k <= 10; k++) {
    ring(0, 'thud', 'at', [k, 0, 0])
    step()
    if (k % 2 === 0) p.frame()
  }
  // Two raised in one step are two sounds.
  ring(0, 'thud', 'at', [11, 0, 0])
  ring(1, 'thud', 'at', [12, 0, 0])
  step()
  p.frame()
  for (let i = 0; i < 20; i++) { step(); p.frame() }
  expect(heard(p.ctx)).toEqual(Array.from({ length: 12 }, (_, i) => ['thud', [i + 1, 0, 0]]))
})

test('a player row\'s own sounds play once each, from that row; a player row first seen plays none of what it holds; a ledger entry of the same id plays too', () => {
  const scene: Scene = {
    world: { audio: TABLE },
    prefabs: {
      audio: { step: 0, next: 1, live: [] },
      bell: { queue: [], walk: false, pos: [0, 0, 0] },
      player: { queue: [], walk: false, pos: [5, 0, 0] },
    },
    actors: [{ is: 'audio' }, { is: 'bell' }, { is: 'player' }],
  }
  const truth = boot(scene, { audio: ledger, bell, player: bell })
  const [b, me] = [truth.rows.find(r => r.kind === 'bell')!, truth.rows.find(r => r.kind === 'player')!]
  const p = page(truth)
  p.frame()
  me.data.queue.push(['thud', 'from', []])
  b.data.queue.push(['thud', 'at', [1, 0, 0]])
  truth.step(DT)
  p.frame()
  p.frame()
  expect(me.data.voiced.map((e: { id: number }) => e.id)).toEqual([2])
  // The bell's on the ledger and the player row's on its own row, each heard once, each where it was raised.
  expect(heard(p.ctx).map(h => h[1]).sort()).toEqual([[1, 0, 0], [5, 0, 0]])
  // A second player row the page sees for the first time, already holding a sound, plays none of it.
  const late = truth.spawn('player', { pos: [9, 0, 0], voiced: [{ id: 99, cue: 'thud', at: [9, 0, 0], step: 1 }] })
  p.frame()
  expect(heard(p.ctx).length).toBe(2)
  late.data.voiced.push({ id: 100, cue: 'thud', at: [9, 0, 0], step: 2 })
  p.frame()
  expect(heard(p.ctx).map(h => h[1])).toContainEqual([9, 0, 0])
  expect(heard(p.ctx).length).toBe(3)
})

test('a page that arrives late hears nothing raised before its first snapshot', () => {
  const { ring, step, truth } = rig()
  ring(0, 'thud', 'at', [1, 0, 0])
  step()
  ring(0, 'thud', 'at', [2, 0, 0])
  step(3)
  const p = page(truth)
  p.frame()
  ring(0, 'thud', 'at', [3, 0, 0])
  step()
  p.frame()
  expect(heard(p.ctx)).toEqual([['thud', [3, 0, 0]]])
})

test('the sound and its rate are picked by the entry\'s id, so two pages hear the same', () => {
  const { ring, step, truth } = rig()
  const a = page(truth), b = page(truth)
  step()
  a.frame(); b.frame()
  for (let k = 0; k < 40; k++) {
    ring(0, 'ding')
    step()
    a.frame()
    if (k % 3 === 0) b.frame()
  }
  step()
  b.frame()
  const picks = (ctx: Ctx) => sounds(ctx).map(s => [s.name, s.playbackRate.value])
  expect(picks(a.ctx)).toEqual(picks(b.ctx))
  expect(picks(a.ctx).length).toBe(40)
  expect(new Set(picks(a.ctx).map(p => p[0]))).toEqual(new Set(['ding1', 'ding2', 'ding3']))
  const rates = picks(a.ctx).map(p => p[1] as number)
  expect(rates.every(r => r >= 0.8 && r < 1.2)).toBe(true)
  expect(new Set(rates).size).toBe(40)
  // A cue with no rate plays at 1, through a gain of the cue's.
  ring(0, 'thud')
  step()
  a.frame()
  expect(sounds(a.ctx).at(-1)!.playbackRate.value).toBe(1)
  expect(sounds(a.ctx)[0].gain.gain.value).toBe(0.5)
})

test('a panner is placed before its sound starts: at the entry\'s point, or on its row while the rows hold it, where it stays once the row has gone', () => {
  const { ring, step, truth, bells } = rig()
  const p = page(truth)
  step()
  p.frame()
  ring(0, 'thud', 'at', [4, 5, 6])
  bells[1].data.walk = true
  ring(1, 'thud', 'from')
  step()
  // The walker was at 50 when it raised the sound and has walked a step since: the panner starts on
  // the row as the frame has it.
  p.frame()
  const [fixed, follows] = sounds(p.ctx)
  expect(fixed.startedAt).toEqual([4, 5, 6])
  expect(follows.startedAt).toEqual([51, 0, 0])
  step(2)
  p.frame()
  expect(follows.panner!.at()).toEqual([53, 0, 0])
  expect(fixed.panner!.at()).toEqual([4, 5, 6])
  truth.end(bells[1])
  step()
  p.frame()
  step()
  p.frame()
  expect(follows.panner!.at()).toEqual([53, 0, 0])
  // Each panner is the space's, but a cue's range for its farthest.
  expect([fixed.panner!.distanceModel, fixed.panner!.refDistance, fixed.panner!.maxDistance, fixed.panner!.rolloffFactor]).toEqual(['linear', 5, 40, 1])
  ring(0, 'far', 'at', [1, 1, 1])
  ring(0, 'thud', 'bare')
  step()
  p.frame()
  const [far, bare] = sounds(p.ctx).slice(-2)
  expect(far.panner!.maxDistance).toBe(100)
  expect(bare.startedAt).toBe(null)
})

test('a cue with cut stops the last sound still playing from the same row, and only that', () => {
  const { ring, step, truth } = rig()
  const p = page(truth)
  step()
  p.frame()
  ring(0, 'thud', 'from')
  step()
  p.frame()
  ring(0, 'saw', 'from')
  step()
  p.frame()
  const [thud, saw] = sounds(p.ctx)
  expect(thud.stopped).toBe(0)
  // From another row, it stops nothing of this one's; a cue with no cut stops nothing.
  ring(1, 'saw', 'from')
  ring(0, 'thud', 'from')
  step()
  p.frame()
  expect(saw.stopped).toBe(undefined)
  // The bell ahead in the rows raises its sound first.
  const [, , second, other] = sounds(p.ctx)
  // A sound that has played to its end is not stopped again.
  second.end()
  ring(0, 'saw', 'from')
  step()
  p.frame()
  expect(second.stopped).toBe(undefined)
  expect(saw.stopped).toBe(undefined)
  expect(other.stopped).toBe(undefined)
})

test('a loop\'s gain follows its field through over and gain, ramped over one step', () => {
  const { step, truth } = rig()
  const p = page(truth)
  step()
  p.frame()
  const rain = () => p.ctx.started.find(s => s.name === 'rain')!
  // No sky row yet: 0, under `over`, is the bottom of `gain`.
  expect(rain().loop).toBe(true)
  expect(rain().gain.gain.value).toBe(0)
  const s = truth.spawn('sky', {})
  s.data.mix.rain = 0.5
  step()
  p.frame()
  p.frame()
  expect(rain().gain.gain.events).toEqual([['target', 0.4, p.ctx.currentTime, DT]])
  s.data.mix.rain = 5
  step()
  p.frame()
  expect(rain().gain.gain.events.at(-1)).toEqual(['target', 0.8, p.ctx.currentTime, DT])
  truth.end(s)
  step()
  p.frame()
  expect(rain().gain.gain.events.at(-1)).toEqual(['target', 0, p.ctx.currentTime, DT])
  expect(p.ctx.started.filter(s => s.name === 'rain').length).toBe(1)
})

test('a height loop follows the listener, and a named loop crossfades when its field changes', () => {
  const { step, truth } = rig()
  const p = page(truth)
  p.camera.position.set(0, 50, 0)
  step()
  p.frame()
  const wind = p.ctx.started.find(s => s.name === 'wind')!
  expect(wind.gain.gain.value).toBeCloseTo(0.6, 12)
  p.camera.position.set(0, 200, 0)
  p.frame()
  expect(wind.gain.gain.events).toEqual([['target', 1, p.ctx.currentTime, DT]])
  // Music: nothing while the field names nothing, then `a`, faded in; then `b` over it.
  const s = truth.spawn('sky', {})
  step()
  p.frame()
  expect(p.ctx.started.map(s => s.name)).toEqual(['rain', 'wind'])
  s.data.song = 'a'
  step()
  p.frame()
  const a = p.ctx.started.find(s => s.name === 'a')!
  expect(a.loop).toBe(true)
  expect(a.gain.gain.events).toEqual([['set', 0, 3], ['ramp', 1, 5]])
  expect(a.started).toEqual([])
  p.ctx.currentTime = 10
  s.data.song = 'b'
  step()
  p.frame()
  p.frame()
  const b = p.ctx.started.find(s => s.name === 'b')!
  expect(b.gain.gain.events).toEqual([['set', 0, 10], ['ramp', 1, 12]])
  // The music crossfaded into starts from its beginning.
  expect(b.started).toEqual([])
  expect(a.gain.gain.events.slice(2)).toEqual([['cancel', 10], ['set', a.gain.gain.value, 10], ['ramp', 0, 12]])
  expect(a.stopped).toBe(12)
  // A name whose sound has not landed is asked for, and plays once it has.
  s.data.song = 'c'
  step()
  p.frame()
  expect(p.asked).toContain('c')
  expect(p.ctx.started.some(s => s.name === 'c')).toBe(false)
  expect(b.stopped).toBe(undefined)
  p.land('c')
  p.frame()
  expect(p.ctx.started.some(s => s.name === 'c')).toBe(true)
  expect(b.stopped).toBe(12)
})

test('the page asks the loader for every sound its cues and loops name on its first frame; an entry whose sound has not landed is let go', () => {
  const { ring, step, truth } = rig()
  const p = page(truth, { landed: [] })
  step()
  p.frame()
  expect(p.asked.sort()).toEqual(['ding1', 'ding2', 'ding3', 'far', 'rain', 'saw', 'thud', 'wind'])
  ring(0, 'thud')
  step()
  p.frame()
  p.land('thud')
  p.frame()
  step()
  p.frame()
  expect(heard(p.ctx)).toEqual([])
  ring(0, 'thud')
  step()
  p.frame()
  expect(heard(p.ctx)).toEqual([['thud', [0, 0, 0]]])
})

test('the volume is the store\'s level, 0 when muted, and 1 with no volume in its numbers or no store', () => {
  for (const [store, table, want] of [
    [{ volume: 0.5, muted: false }, TABLE, 0.5],
    [{ volume: 0.5, muted: true }, TABLE, 0],
    [{ volume: 0.5, muted: false }, { ...TABLE, volume: undefined }, 1],
    [null, TABLE, 1],
  ] as const) {
    const { ring, step, truth } = rig()
    const p = page(truth, { store, table })
    step()
    p.frame()
    ring(0, 'thud')
    step()
    p.frame()
    expect(p.ctx.master().gain.value).toBe(want)
    expect(p.ctx.master().out).toBe(p.ctx.destination)
  }
})

test('the listener takes the camera\'s pose each frame', () => {
  const { step, truth } = rig()
  const p = page(truth)
  p.camera.position.set(1, 2, 3)
  p.camera.lookAt(1, 2, -7)
  p.camera.rotateZ(Math.PI / 2)
  step()
  p.frame()
  const l = p.ctx.listener
  const v = (x: Param, y: Param, z: Param) => [x.value, y.value, z.value].map(n => +n.toFixed(9) + 0)
  expect(v(l.positionX, l.positionY, l.positionZ)).toEqual([1, 2, 3])
  expect(v(l.forwardX, l.forwardY, l.forwardZ)).toEqual([0, 0, -1])
  expect(v(l.upX, l.upY, l.upZ)).toEqual([-1, 0, 0])
  p.camera.position.set(4, 5, 6)
  p.frame()
  expect(v(l.positionX, l.positionY, l.positionZ)).toEqual([4, 5, 6])
})

test('a locked context lets entries go and resumes on the first pointerdown or keydown; one running at once puts no listener on the page', () => {
  expect(page(rig().truth).ctx.state).toBe('running')
  expect([...on.keys()]).toEqual([])
  Ctx.state = 'suspended'
  const { ring, step, truth } = rig()
  const p = page(truth)
  expect([...on.keys()].sort()).toEqual(['keydown', 'pointerdown'])
  step()
  p.frame()
  ring(0, 'thud', 'at', [1, 0, 0])
  step()
  p.frame()
  on.get('keydown')!()
  expect(p.ctx.resumed).toBe(1)
  expect([...on.keys()]).toEqual([])
  step()
  p.frame()
  ring(0, 'thud', 'at', [2, 0, 0])
  step()
  p.frame()
  expect(heard(p.ctx)).toEqual([['thud', [2, 0, 0]]])
})

test('a context the page runs on its own a moment after it is made takes its listeners off the page', () => {
  Ctx.state = 'suspended'
  const p = page(rig().truth)
  expect([...on.keys()].sort()).toEqual(['keydown', 'pointerdown'])
  p.ctx.run()
  expect([...on.keys()]).toEqual([])
  expect(p.ctx.resumed).toBe(0)
})

test('close stops every sound and loop, closes the context and takes its listeners off the page', () => {
  Ctx.state = 'suspended'
  const { ring, step, truth } = rig()
  const p = page(truth)
  p.ctx.state = 'running'
  step()
  p.frame()
  ring(0, 'thud')
  step()
  p.frame()
  p.me.close()
  expect(p.ctx.started.length).toBe(3)
  expect(p.ctx.started.every(s => s.stopped === 0)).toBe(true)
  expect(p.ctx.state).toBe('closed')
  expect([...on.keys()]).toEqual([])
})

test('a stream plays its blocks back to back through the volume, lead seconds ahead after running out, letting go of one past most ahead', () => {
  const { truth } = rig()
  const p = page(truth)
  const s = p.me.stream({ rate: 1000, lead: 0.05, most: 0.2 })
  const block = (n: number, v = 0.5) => new Float32Array(n).fill(v)
  s.push(block(20))
  s.push(block(30, -0.25))
  const [a, b] = p.ctx.started
  expect(a.started).toEqual([3.05])
  expect(b.started).toEqual([3.07])
  expect([...(a.buffer as any).data]).toEqual([...block(20)])
  expect([(b.buffer as any).sampleRate, (b.buffer as any).length]).toEqual([1000, 30])
  // through no panner, straight into the volume and out
  expect(chain(a).slice(1)).toEqual([chain(a).at(-2), p.ctx.destination])
  // the stream runs out: the next block is placed lead ahead of the clock again
  p.ctx.currentTime = 4
  s.push(block(10))
  expect(p.ctx.started[2].started).toEqual([4.05])
  // blocks that would start more than most ahead are let go
  for (let i = 0; i < 20; i++) s.push(block(10))
  const at = p.ctx.started.slice(3).map(x => x.started![0])
  expect(Math.max(...at)).toBeLessThanOrEqual(4 + 0.2)
  expect(at.length).toBe(15)
  s.close()
  expect(p.ctx.started.every(x => x.stopped === 0)).toBe(true)
})

test('a stream lets its blocks go while the context is locked, and where there is none', () => {
  Ctx.state = 'suspended'
  const { truth } = rig()
  const p = page(truth)
  const s = p.me.stream({ rate: 1000, lead: 0.05, most: 0.2 })
  s.push(new Float32Array(10))
  expect(p.ctx.started).toEqual([])
  vi.stubGlobal('AudioContext', undefined)
  const none = page(truth)
  expect(() => none.me.stream({ rate: 1000, lead: 0.05, most: 0.2 }).push(new Float32Array(10))).not.toThrow()
})

test('a held sound repeats its buffer whole from now at its rate and gain, placed at its point through a panner of space\'s numbers with its range for max, through the volume', () => {
  const { truth } = rig()
  const p = page(truth)
  const held = p.me.hold(p.plugins, { name: 'engine' } as any, { rate: 1.5, gain: 0.4, at: [3, 0, -2], range: 90 })!
  const [s] = p.ctx.started
  expect([s.name, s.loop, s.loopStart, s.loopEnd, s.playbackRate.value, s.started]).toEqual(['engine', true, 0, 0, 1.5, []])
  expect(s.gain.gain.value).toBe(0.4)
  expect(s.startedAt).toEqual([3, 0, -2])
  const panner = s.panner!
  expect([panner.distanceModel, panner.refDistance, panner.maxDistance, panner.rolloffFactor]).toEqual(['linear', 5, 90, 1])
  expect(chain(s).slice(-2)).toEqual([p.ctx.master(), p.ctx.destination])
  // set sends the rate and the gain toward new values over a time constant of one step; put moves it
  p.ctx.currentTime = 7
  held.set(2, 0.1)
  expect(s.playbackRate.events).toEqual([['target', 2, 7, DT]])
  expect(s.gain.gain.events).toEqual([['target', 0.1, 7, DT]])
  held.put([10, 1, 1])
  expect(panner.at()).toEqual([10, 1, 1])
  // stop fades it out over the same time constant and stops it five of them later
  p.ctx.currentTime = 8
  held.stop()
  expect(s.gain.gain.events.at(-1)).toEqual(['target', 0, 8, DT])
  expect(s.stopped).toBe(8 + 5 * DT)
})

test('a sound played once plays its buffer a single time from now at its rate and gain, placed at its point through a panner of space\'s numbers with its range for max, through the volume', () => {
  const { truth } = rig()
  const p = page(truth)
  p.me.once(p.plugins, { name: 'stomp' } as any, { rate: 0.9, gain: 0.6, at: [4, 0, 7], range: 120 })
  const [s] = p.ctx.started
  expect([s.name, s.loop, s.playbackRate.value, s.started]).toEqual(['stomp', false, 0.9, []])
  expect(s.gain.gain.value).toBe(0.6)
  expect(s.startedAt).toEqual([4, 0, 7])
  const panner = s.panner!
  expect([panner.distanceModel, panner.refDistance, panner.maxDistance, panner.rolloffFactor]).toEqual(['linear', 5, 120, 1])
  expect(chain(s).slice(-2)).toEqual([p.ctx.master(), p.ctx.destination])
  // with no point it plays unplaced, straight into the volume
  p.me.once(p.plugins, { name: 'click' } as any, { rate: 1, gain: 0.3 })
  expect(chain(p.ctx.started[1]).slice(1)).toEqual([p.ctx.started[1].gain, p.ctx.master(), p.ctx.destination])
})

test('a sound played once is let go while the context is locked, and where there is none', () => {
  Ctx.state = 'suspended'
  const { truth } = rig()
  const p = page(truth)
  p.me.once(p.plugins, { name: 'stomp' } as any, { rate: 1, gain: 1, at: [0, 0, 0] })
  expect(p.ctx.started).toEqual([])
  p.ctx.run()
  p.me.once(p.plugins, { name: 'stomp' } as any, { rate: 1, gain: 1, at: [0, 0, 0] })
  expect(p.ctx.started.map(s => s.name)).toEqual(['stomp'])
  vi.stubGlobal('AudioContext', undefined)
  const none = page(truth)
  expect(() => none.me.once(none.plugins, { name: 'stomp' } as any, { rate: 1, gain: 1 })).not.toThrow()
})

test('where there is no Web Audio there is no context, and a page plays nothing and asks for nothing', () => {
  vi.stubGlobal('AudioContext', undefined)
  const { ring, step, truth } = rig()
  const p = page(truth)
  expect(p.me.context).toBe(undefined)
  step()
  p.frame()
  ring(0, 'thud')
  step()
  p.frame()
  p.me.close()
  expect(p.asked).toEqual([])
  expect([...on.keys()]).toEqual([])
})

test('an audition plays a catalogue sound, or a cue as an entry of it sounds, once, unplaced, at its gain, resuming a locked context', async () => {
  Ctx.state = 'suspended'
  const { truth } = rig()
  const p = page(truth)
  const asked: string[] = []
  p.plugins.loader.load = (name: string) => { asked.push(name); return Promise.resolve({ name }) }
  await p.me.audition(p.plugins, 'far')
  expect(p.ctx.resumed).toBe(1)
  expect(heard(p.ctx)).toEqual([['far', null]])
  expect(sounds(p.ctx)[0].gain.gain.value).toBe(1)
  expect(sounds(p.ctx)[0].playbackRate.value).toBe(1)
  await p.me.audition(p.plugins, TABLE.cues.ding as never)
  const s = sounds(p.ctx)[1]
  expect(['ding1', 'ding2', 'ding3']).toContain(s.name)
  expect(s.startedAt).toBeNull()
  expect(s.gain.gain.value).toBe(0.5)
  expect(s.playbackRate.value).toBeGreaterThanOrEqual(0.8)
  expect(s.playbackRate.value).toBeLessThanOrEqual(1.2)
  expect(asked).toEqual(['far', s.name])
})

// ---------------------------------------------------------------- the listener under render2d, and none

// A 2D scene's numbers: `screen` in place of `space`, fading over 100 canvas pixels off the view.
const FLAT = { ...TABLE, space: undefined, screen: { model: 'linear', ref: 0, max: 100, rolloff: 1 } }
const round = (v: number[]) => v.map(n => +n.toFixed(9) + 0)

test('under render2d a placed sound is panned by its x across the canvas, edge to edge, and fades by screen\'s numbers with its distance off the view', () => {
  const { ring, step, truth } = rig(FLAT)
  const p = page(truth, { table: FLAT, listener: '2d' })
  step()
  p.frame()
  // Looking at the origin a step of the world is two pixels: x −80 is the left edge and 80 the right,
  // y −60 the top and 60 the bottom.
  for (const at of [[-80, 0, 0], [80, 0, 0], [0, 0, 0], [40, -60, 0], [20, -70, 0], [-105, 0, 0], [-130, 0, 0], [-200, 0, 0], [100, 80, 0]]) ring(0, 'thud', 'at', at)
  step()
  p.frame()
  expect(sounds(p.ctx).map(s => round(s.startedPan!))).toEqual([
    [-1, 1], [1, 1], [0, 1], [0.5, 1],
    // 20 pixels above the top: a fifth of the way out.
    [0.25, 0.8],
    // 50 and 100 pixels past the left edge, and 240, past `max`; then 40 right and 40 down.
    [-1, 0.5], [-1, 0], [-1, 0], round([1, 1 - Math.hypot(40, 40) / 100]),
  ])
  // It plays through no PannerNode, and out through the one master gain.
  expect(sounds(p.ctx).every(s => s.startedAt === null && chain(s).at(-2) === p.ctx.master())).toBe(true)
})

test('under render2d a placed sound follows its row and the camera every frame, stays where its row was once it has gone, and is let go once played out', () => {
  const { ring, step, truth, bells } = rig(FLAT)
  const p = page(truth, { table: FLAT, listener: '2d' })
  step()
  p.frame()
  ring(0, 'thud', 'at', [0, 0, 0])
  bells[1].data.walk = true
  ring(1, 'thud', 'from')
  step()
  p.frame()
  // The walker raised it at 50 and has walked a step since: x 262 of 320.
  const [fixed, follows] = sounds(p.ctx)
  expect(round(fixed.startedPan!)).toEqual([0, 1])
  expect(round(follows.startedPan!)).toEqual([0.6375, 1])
  step(2)
  p.frame()
  expect(round(follows.panned)).toEqual([0.6625, 1])
  // The camera looks 40 along: the fixed sound is a quarter of the canvas left of the middle.
  p.look[0] = 40
  p.frame()
  expect(round(fixed.panned)).toEqual([-0.5, 1])
  expect(round(follows.panned)).toEqual([0.1625, 1])
  truth.end(bells[1])
  step()
  p.frame()
  step()
  p.frame()
  expect(round(follows.panned)).toEqual([0.1625, 1])
  p.look[0] = 53
  p.frame()
  expect(round(follows.panned)).toEqual([0, 1])
  expect(round(fixed.panned)).toEqual([-0.6625, 1])
  // Played out, it is moved no more.
  fixed.end()
  p.look[0] = 0
  p.frame()
  expect(round(fixed.panned)).toEqual([-0.6625, 1])
  expect(round(follows.panned)).toEqual([0.6625, 1])
})

test('under render2d a cue\'s range stands in for screen\'s max, and every distance model is a PannerNode\'s formula', () => {
  const at = (d: number) => [-80 - d / ZOOM, 0, 0] // `d` canvas pixels left of the view
  const fade = (screen: Record<string, unknown>, cue: string, d: number) => {
    const table = { ...FLAT, screen }
    const { ring, step, truth } = rig(table)
    const p = page(truth, { table, listener: '2d' })
    step()
    p.frame()
    ring(0, cue, 'at', at(d))
    step()
    p.frame()
    return sounds(p.ctx)[0].startedPan![1]
  }
  const linear50 = { model: 'linear', ref: 0, max: 50, rolloff: 1 }
  expect(fade(linear50, 'thud', 25)).toBeCloseTo(0.5, 12)
  expect(fade(linear50, 'far', 25)).toBeCloseTo(0.75, 12)
  // A linear rolloff is held within 0 and 1, and one whose max is its ref is 1 − rolloff anywhere.
  expect(fade({ model: 'linear', ref: 0, max: 100, rolloff: 3 }, 'thud', 50)).toBeCloseTo(0.5, 12)
  expect(fade({ model: 'linear', ref: 100, max: 100, rolloff: 0.25 }, 'thud', 0)).toBeCloseTo(0.75, 12)
  expect(fade({ model: 'linear', ref: 20, max: 120, rolloff: 1 }, 'thud', 10)).toBe(1)
  expect(fade({ model: 'inverse', ref: 10, max: 1000, rolloff: 1 }, 'thud', 30)).toBeCloseTo(1 / 3, 12)
  expect(fade({ model: 'inverse', ref: 10, max: 1000, rolloff: 1 }, 'thud', 5)).toBe(1)
  expect(fade({ model: 'exponential', ref: 10, max: 1000, rolloff: 2 }, 'thud', 20)).toBeCloseTo(0.25, 12)
})

test('with neither renderer, or neither with a world, every sound plays unplaced and a cut still stops its row\'s last; the listener\'s height is 0 under any listener but render3d', () => {
  for (const listener of ['none', 'blank', '2d'] as const) {
    const { ring, step, truth } = rig(FLAT)
    const p = page(truth, { table: FLAT, listener })
    p.camera.position.set(0, 50, 0)
    step()
    p.frame()
    // wind's `over` is [0, 100] onto [0.2, 1]: height 0 is its bottom.
    expect(p.ctx.started.find(s => s.name === 'wind')!.gain.gain.value).toBe(0.2)
    if (listener === '2d') continue
    ring(0, 'thud', 'at', [4, 5, 6])
    ring(1, 'thud', 'from')
    step()
    p.frame()
    ring(1, 'saw', 'from')
    step()
    p.frame()
    expect(heard(p.ctx)).toEqual([['thud', null], ['thud', null], ['saw', null]])
    expect(sounds(p.ctx).every(s => !s.stereo && chain(s).at(-2) === p.ctx.master())).toBe(true)
    expect(sounds(p.ctx).map(s => s.stopped)).toEqual([undefined, 0, undefined])
  }
})

test('a placed sound under a renderer whose numbers the table does not give throws; an unplaced one plays', () => {
  for (const [listener, table, missing] of [['3d', FLAT, 'space'], ['2d', TABLE, 'screen']] as const) {
    const { ring, step, truth } = rig(table)
    const p = page(truth, { table, listener })
    step()
    p.frame()
    ring(0, 'thud', 'bare')
    step()
    p.frame()
    expect(heard(p.ctx)).toEqual([['thud', null]])
    ring(0, 'thud', 'at', [1, 2, 3])
    step()
    expect(() => p.frame()).toThrow(`audio has no ${missing}, the numbers a sound placed where ${listener === '3d' ? 'render3d' : 'render2d'} listens fades by`)
  }
})

test('a loop repeats its region, and a named loop the region it gives the sound it plays, each from 0; a sound given none repeats whole', () => {
  const table = {
    ...TABLE,
    loops: {
      rain: { ...TABLE.loops.rain, loop: [2, 10] },
      wind: TABLE.loops.wind,
      music: { ...TABLE.loops.music, loop: { a: [1.5, 30] } },
    },
  }
  const { step, truth } = rig(table)
  const p = page(truth, { table })
  step()
  p.frame()
  const s = truth.spawn('sky', {})
  s.data.song = 'a'
  step()
  p.frame()
  s.data.song = 'b'
  step()
  p.frame()
  const got = Object.fromEntries(p.ctx.started.map(x => [x.name, [x.loop, x.loopStart, x.loopEnd, x.started]]))
  expect(got).toEqual({
    rain: [true, 2, 10, []],
    wind: [true, 0, 0, []],
    a: [true, 1.5, 30, []],
    b: [true, 0, 0, []],
  })
})

// A gun's manifest, as the library writes it, and how long each of its files plays.
const GUN = {
  mix: { near: 4, far: 400, choke: ['tail'], stems: { crack: [1, 0], body: [1, 0.5], tail: [0.5, 1] } },
  variants: [{ crack: 'c1', body: 'b1', tail: 't1' }, { crack: 'c2', body: 'b2', tail: 't2' }],
}
const SECONDS: Record<string, number> = { c1: 0.05, c2: 0.05, b1: 0.3, b2: 0.3, t1: 2, t2: 2 }
const ARMED = {
  ...TABLE,
  cues: { ...TABLE.cues, bang: { gun: 'bang-gun', gain: 0.7, range: 300 } },
  held: { hum: { kind: 'bell', field: 'on', sound: 'hum', over: [0, 1], gain: [0, 0.6], rate: [0.5, 1], range: 200 } },
}
// A page whose loader hands the gun's manifest when asked, and each file beside it as its name's bytes.
const armed = (truth: Truth) => {
  const p = page(truth, { table: ARMED, landed: [...SOUNDS, 'hum'] })
  p.plugins.loader.load = (name: string) => (name === 'bang-gun' ? Promise.resolve(structuredClone(GUN)) : new Promise(() => {}))
  p.plugins.loader.beside = (_name: string, file: string) => Promise.resolve(new TextEncoder().encode(file).buffer)
  return p
}
const landing = () => new Promise(r => setTimeout(r, 0))
// A stem's gain `d` metres off, by the mix: its near gain to its far one, eased over the distance's
// logarithm.
const stemAt = (ends: number[], d: number) => {
  const s = Math.min(1, Math.max(0, Math.log(Math.max(d, GUN.mix.near) / GUN.mix.near) / Math.log(GUN.mix.far / GUN.mix.near)))
  return ends[0] + (ends[1] - ends[0]) * s * s * (3 - 2 * s)
}

test('a gun\'s round plays every stem of one variant, each as loud as the mix makes its distance from the listener, through the cue\'s gain and a panner on its row; one raised before the gun has landed is let go', async () => {
  const { ring, step, truth } = rig(ARMED)
  const p = armed(truth)
  step()
  p.frame()
  ring(0, 'bang', 'round', [0, 0, 0], 0)
  step()
  p.frame()
  expect(sounds(p.ctx)).toEqual([])
  await landing()
  for (const [i, k] of [[0, 1], [1, 2], [0, 3]]) {
    ring(i, 'bang', 'round', [0, 0, 0], 0)
    step()
    p.frame()
    const round = sounds(p.ctx).slice(-3)
    expect(round.length, `round ${k}`).toBe(3)
    // Every stem of one variant: one of each, all of the same variant.
    expect(round.map(s => s.name[0]).sort()).toEqual(['b', 'c', 't'])
    expect(new Set(round.map(s => s.name[1])).size).toBe(1)
    const d = Math.hypot(...(truth.rows.filter(r => r.kind === 'bell')[i].data.pos as number[]))
    for (const s of round) {
      const stem = { c: 'crack', b: 'body', t: 'tail' }[s.name[0]] as keyof typeof GUN.mix.stems
      expect(s.gain.gain.value).toBeCloseTo(stemAt(GUN.mix.stems[stem], d), 9)
      expect((chain(s)[2] as Gain).gain.value).toBe(0.7)
      expect(s.panner!.maxDistance).toBe(300)
      expect(s.startedAt).toEqual(truth.rows.filter(r => r.kind === 'bell')[i].data.pos)
    }
  }
})

test('the stems a gun\'s mix chokes are faded out as the next round from the same row starts, and a round from another row chokes none of them', async () => {
  const { ring, step, truth } = rig(ARMED)
  const p = armed(truth)
  step()
  p.frame()
  await landing()
  ring(0, 'bang', 'round', [0, 0, 0], 0)
  step()
  p.frame()
  const tail = sounds(p.ctx).find(s => s.name.startsWith('t'))!
  ring(1, 'bang', 'round', [0, 0, 0], 0)
  step()
  p.frame()
  expect(tail.gain.gain.events).toEqual([])
  ring(0, 'bang', 'round', [0, 0, 0], 0.004)
  step()
  p.frame()
  const next = sounds(p.ctx).at(-1)!.started![0]
  expect(tail.gain.gain.events).toEqual([['target', 0, next, 0.012]])
  // The crack and the body, which the mix does not choke, ring on.
  for (const s of sounds(p.ctx).slice(0, 3).filter(s => !s.name.startsWith('t'))) expect(s.gain.gain.events).toEqual([])
})

test('a round with t starts that far into its step, the steps placed a step apart on the context\'s clock two steps ahead of the frame first seen; a step whose time has long passed places them again', async () => {
  const { ring, step, truth } = rig(ARMED)
  const p = armed(truth)
  step()
  p.frame()
  await landing()
  for (const t of [0, 0.004, 0.008]) ring(0, 'bang', 'round', [0, 0, 0], t)
  step()
  p.frame()
  ring(0, 'bang', 'round', [0, 0, 0], 0.002)
  step()
  // The packets bunch: two steps reach the page in one frame, and the clock has moved on by less than a step.
  ring(0, 'bang', 'round', [0, 0, 0], 0.006)
  step()
  p.ctx.currentTime += DT / 2
  p.frame()
  const starts = (n: number) => sounds(p.ctx).filter(s => s.name.startsWith('c')).slice(n).map(s => s.started![0])
  const base = 3 + 2 * DT
  expect(starts(0)).toEqual([base, base + 0.004, base + 0.008, base + DT + 0.002, base + 2 * DT + 0.006])
  // A step whose time has passed by more than a step: the steps are placed again, two steps on.
  p.ctx.currentTime += 1
  ring(0, 'bang', 'round', [0, 0, 0], 0.003)
  step()
  p.frame()
  expect(starts(5)).toEqual([p.ctx.currentTime + 2 * DT + 0.003])
  // A cue whose entry carries no t starts at once.
  ring(0, 'thud', 'from')
  step()
  p.frame()
  expect(sounds(p.ctx).at(-1)!.started).toEqual([0])
})

test('a held loop plays on each row of its kind while its field gives it a gain, placed on the row, its gain and rate following the field, and fades out and stops once its gain is 0 or its row is gone', () => {
  const { step, truth, bells } = rig(ARMED)
  const p = armed(truth)
  step()
  p.frame()
  const hums = () => p.ctx.started.filter(s => s.loop && s.name === 'hum')
  expect(hums()).toEqual([])
  bells[1].data.on = true
  step()
  p.frame()
  expect(hums().length).toBe(1)
  const hum = hums()[0]
  expect(hum.startedAt).toEqual([50, 0, 0])
  expect(hum.panner!.maxDistance).toBe(200)
  expect(hum.gain.gain.events).toEqual([['target', 0.6, 3, DT]])
  expect(hum.playbackRate.value).toBe(1)
  bells[1].data.on = 0.5
  bells[1].data.walk = true
  step()
  p.frame()
  expect(hum.gain.gain.events.at(-1)).toEqual(['target', 0.3, 3, DT])
  expect(hum.playbackRate.events.at(-1)).toEqual(['target', 0.75, 3, DT])
  expect(hum.panner!.at()).toEqual(bells[1].data.pos)
  expect(hums().length).toBe(1)
  bells[1].data.on = false
  step()
  p.frame()
  expect(hum.gain.gain.events.at(-1)).toEqual(['target', 0, 3, DT])
  expect(hum.stopped).toBe(3 + 5 * DT)
  // Back on, a loop starts again; its row gone, it stops.
  bells[1].data.on = 1
  step()
  p.frame()
  expect(hums().length).toBe(2)
  truth.end(bells[1])
  step()
  p.frame()
  expect(hums()[1].stopped).toBe(3 + 5 * DT)
})
