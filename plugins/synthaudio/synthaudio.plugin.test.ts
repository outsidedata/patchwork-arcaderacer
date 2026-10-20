// synthaudio over a recording stand-in of Tone: every node made, what it was wired to, every option
// it was made with, and every note it was asked to play. What is proven is what the plugin builds and
// when, never how Tone sounds. The stand-in's transport runs 192 ticks a quarter, so a sixteenth is
// 48 ticks, and 384 ticks a second, so a sixteenth is 0.125 s at 120 bpm; its clock is `clock.now`,
// Tone's own a lookahead of 0.1 s ahead of it.
import { beforeEach, expect, test, vi } from 'vitest'
import { synthaudio, type Table } from './synthaudio.plugin.ts'
import { sixteenth, type Params, type Project } from './synthaudio.sim.ts'

type Made = { type: string; options: any; into: string[]; disposed: boolean; ramps: number[][]; gain: { value: number }; pan: { value: number } }
const { calls, made, transport, clock, node } = vi.hoisted(() => {
  const calls: unknown[][] = []
  const made: Made[] = []
  const clock = { now: 0 }
  const transport = {
    PPQ: 192,
    state: 'stopped',
    bpms: [] as number[][],
    bpm: { setValueAtTime(v: number, t: number) { transport.bpms.push([v, t]) } },
    getTicksAtTime: (t: number) => t * 384,
    start() { transport.state = 'started' },
  }
  const node = (type: string) =>
    class {
      me: Made
      gain: any
      pan: any
      constructor(o: any = {}) {
        const me: Made = { type, options: o, into: [], disposed: false, ramps: [], gain: { value: o.gain ?? 1 }, pan: { value: o.pan ?? 0 } }
        this.me = me
        made.push(me)
        this.gain = Object.assign(me.gain, { cancelScheduledValues() {}, setValueAtTime() {}, getValueAtTime: () => 1, linearRampToValueAtTime: (v: number, t: number) => me.ramps.push([v, t]) })
        this.pan = me.pan
      }
      connect(to: any) { this.me.into.push(to.me.type); return this }
      chain(...to: any[]) { let from: any = this; for (const t of to) { from.connect(t); from = t } return this }
      start(...a: unknown[]) { calls.push([type, 'start', ...a]); return this }
      stop() { calls.push([type, 'stop']); return this }
      dispose() { this.me.disposed = true }
      triggerAttack(...a: unknown[]) { calls.push([type, 'attack', ...a]) }
      triggerRelease(...a: unknown[]) { calls.push([type, 'release', ...a]) }
      triggerAttackRelease(...a: unknown[]) { calls.push([type, 'play', ...a]) }
      releaseAll() { calls.push([type, 'hush']) }
    }
  return { calls, made, transport, clock, node }
})
vi.mock('tone', () => ({
  Context: class {
    state = 'running'
    transport = transport
    destination = { me: { type: 'destination' } }
    rawContext = { decodeAudioData: async (b: ArrayBuffer) => ({ decoded: new TextDecoder().decode(b) }) }
    now() { return clock.now + 0.1 }
    immediate() { return clock.now }
    resume() {}
    close() {}
  },
  ToneAudioBuffer: class { constructor(public raw: unknown) {} },
  Gain: node('Gain'), Panner: node('Panner'), Compressor: node('Compressor'), Limiter: node('Limiter'), Filter: node('Filter'),
  FeedbackDelay: node('FeedbackDelay'), Reverb: node('Reverb'),
  PolySynth: node('PolySynth'), Synth: node('Synth'), FMSynth: node('FMSynth'), MonoSynth: node('MonoSynth'), PluckSynth: node('PluckSynth'),
  MembraneSynth: node('MembraneSynth'), NoiseSynth: node('NoiseSynth'), MetalSynth: node('MetalSynth'), Player: node('Player'), Sampler: node('Sampler'),
  Part: class {
    constructor(o: any) { calls.push(['part', o.events.map((e: any) => [e.time, e.track, e.note, e.dur, e.vel]), o.loopEnd]); (this as any).cb = o.callback; parts.push(this) }
    start(t: string, offset?: string) { calls.push(['part start', t, offset]); return this }
    stop(t: number) { calls.push(['part stop', t]) }
    dispose() {}
  },
}))
const parts: any[] = []
vi.stubGlobal('AudioContext', class {})

const lead: Params = { wave: 'square', attack: 0.01, decay: 0.1, sustain: 0.5, release: 0.3, cutoff: 900, resonance: 2, echo: 0.2, room: 0.1, gain: 0.5, pan: 0.25 }
const master: Project['master'] = { compressor: { threshold: -18, ratio: 3, attack: 0.01, release: 0.2 }, limiter: -1, echo: { time: '8n', feedback: 0.3 }, room: { decay: 2.5 } }
const jam = (): Project => ({
  bpm: 120,
  length: 32,
  master,
  tracks: {
    lead: { instrument: { is: 'monosynth', params: { ...lead }, presets: { lead }, loaded: 'lead' }, patterns: { a: { length: 16, notes: [[0, 'C4', 2, 0.8]] } }, clips: [[0, 'a', 1]] },
    drums: {
      instrument: {
        is: 'drumkit',
        params: { pads: { kick: { voice: 'membrane', pitch: 'C1', decay: 0.4, gain: 1 }, snare: { voice: 'noise', decay: 0.2, gain: 0.4 }, tom: { voice: 'sample', sample: 'tom.wav', decay: 0.5, gain: 0.8 }, gone: { voice: 'sample', sample: 'nope.wav', decay: 0.5, gain: 1 } }, echo: 0, room: 0, gain: 0.8, pan: 0 },
        presets: {}, loaded: null,
      },
      patterns: { b: { length: 16, notes: [[4, 'snare', 1, 1]] } },
      clips: [[0, 'b', 2]],
    },
  },
})
const groove = (): Project => ({
  bpm: 96, length: 16, master,
  tracks: { pad: { instrument: { is: 'synth', params: { wave: 'sine', attack: 0.4, decay: 0.3, sustain: 0.8, release: 1.5, echo: 0, room: 0.4, gain: 0.3, pan: 0 }, presets: {}, loaded: null }, patterns: { c: { length: 16, notes: [[0, 'E4', 16, 0.6]] } }, clips: [[0, 'c', 1]] } },
})

const table: Table = { projects: ['jam', 'groove'], music: { kind: 'setlist', path: 'song' } }
const rows: any[] = []
const files: Record<string, string> = { 'jam tom.wav': 'TOM' }
const besides: string[] = []
const plugins = {
  wire: { scene: { world: { synthaudio: table } }, rows },
  loader: {
    load: async (n: string) => ({ jam: jam(), groove: groove() } as Record<string, Project>)[n],
    beside: async (n: string, path: string) => { besides.push(`${n} ${path}`); const f = files[`${n} ${path}`]; return f === undefined ? undefined : new TextEncoder().encode(f).buffer },
  },
} as any
const q = sixteenth(120)
const settle = async () => { for (let i = 0; i < 6; i++) await Promise.resolve() }
const of = (type: string) => made.filter(m => m.type === type)
const live = (type: string) => of(type).filter(m => !m.disposed)

beforeEach(() => {
  calls.length = 0
  made.length = 0
  rows.length = 0
  parts.length = 0
  besides.length = 0
  clock.now = 0
  transport.state = 'stopped'
  transport.bpms.length = 0
})

test('each instrument is built from what it is and its params, and goes out through its level, pan and sends to the project\'s echo, room, compressor and limiter', () => {
  const s = synthaudio()
  s.tick(plugins)
  s.use(jam(), 'jam')
  const [mono] = of('MonoSynth')
  expect(mono.options).toMatchObject({ oscillator: { type: 'square' }, envelope: { attack: 0.01, decay: 0.1, sustain: 0.5, release: 0.3 }, filter: { type: 'lowpass', Q: 2 }, filterEnvelope: { baseFrequency: 900, octaves: 0 } })
  expect(mono.into).toEqual(['Gain'])
  const level = made.find(m => m.type === 'Gain' && m.gain.value === 0.5)!
  expect(level.into).toEqual(['Panner'])
  const [pan] = of('Panner')
  expect(pan.pan.value).toBe(0.25)
  expect(pan.into).toEqual(['Gain', 'Gain', 'Gain'])
  const [delay] = of('FeedbackDelay'), [reverb] = of('Reverb'), [comp] = of('Compressor'), [limit] = of('Limiter')
  expect(delay.options).toMatchObject({ delayTime: '8n', feedback: 0.3, wet: 1 })
  expect(reverb.options).toMatchObject({ decay: 2.5, wet: 1 })
  expect(comp.options).toMatchObject({ threshold: -18, ratio: 3 })
  expect(comp.into).toEqual(['Limiter'])
  expect(limit.options).toMatchObject({ threshold: -1 })
  expect(limit.into).toEqual(['Gain'])
  // The drumkit: a voice per pad at its pitch, dying away over its decay.
  expect(of('MembraneSynth')[0].options).toMatchObject({ envelope: { decay: 0.4, sustain: 0 } })
  expect(of('NoiseSynth')[0].options).toMatchObject({ envelope: { decay: 0.2, sustain: 0 } })
})

test('the keys play a track of the project used; a drum note names its pad', () => {
  const s = synthaudio()
  s.tick(plugins)
  expect(() => s.attack('lead', 'C4')).toThrow('no project to play keys on')
  s.use(jam(), 'jam')
  s.attack('lead', 'C4', 0.5)
  expect(s.held()).toEqual([{ track: 'lead', note: 'C4' }])
  s.release('lead', 'C4')
  expect(s.held()).toEqual([])
  s.attack('drums', 'kick')
  s.attack('drums', 'snare')
  s.attack('drums', 'cowbell')
  expect(calls).toEqual([
    ['MonoSynth', 'attack', 'C4', undefined, 0.5], ['MonoSynth', 'release', undefined],
    ['MembraneSynth', 'attack', 'C1', undefined, 1], ['NoiseSynth', 'attack', undefined, 1],
  ])
  expect(() => s.attack('bass', 'C2')).toThrow('synthaudio\'s project has no track bass')
})

test('a project handed again builds again only the tracks whose sound changed; a level, a pan or a send builds nothing', () => {
  const s = synthaudio()
  s.tick(plugins)
  const p = jam()
  s.use(p, 'jam')
  const before = made.length
  p.tracks.lead.instrument.params.gain = 0.9
  p.tracks.lead.instrument.params.pan = -1
  p.tracks.lead.instrument.params.echo = 0.5
  s.use(p, 'jam')
  expect(made.length).toBe(before)
  expect(made.some(m => m.type === 'Gain' && m.gain.value === 0.9 && !m.disposed)).toBe(true)
  expect(live('Panner').map(m => m.pan.value)).toContain(-1)
  p.tracks.lead.instrument.params.cutoff = 1200
  s.use(p, 'jam')
  expect(of('MonoSynth').map(m => m.disposed)).toEqual([true, false])
  expect(live('MonoSynth')[0].options.filterEnvelope.baseFrequency).toBe(1200)
  // The drumkit was left alone.
  expect(of('MembraneSynth')).toHaveLength(1)
  delete (p.tracks as any).drums
  s.use(p, 'jam')
  expect(live('MembraneSynth')).toHaveLength(0)
  p.master.limiter = -3
  s.use(p, 'jam')
  expect(live('Limiter').map(m => m.options.threshold)).toEqual([-3])
  p.master.limiter = -1
})

test('a project handed that does not check is refused, naming where', () => {
  const s = synthaudio()
  s.tick(plugins)
  const p: any = jam()
  p.tracks.lead.instrument.params.wave = 'pulse'
  expect(() => s.use(p, 'jam')).toThrow('tracks.lead.instrument.params.wave is "pulse"')
  expect(() => s.audition(p, 'jam')).toThrow('params.wave is "pulse"')
})

test('a sample is fetched beside the project\'s entry and decoded; one not there plays nothing, says nothing, and is not fetched again', async () => {
  const error = vi.spyOn(console, 'error'), warn = vi.spyOn(console, 'warn')
  const s = synthaudio()
  s.tick(plugins)
  s.use(jam(), 'jam')
  // Until a sample lands, its pad is silent.
  expect(of('Player')).toHaveLength(0)
  expect(besides.sort()).toEqual(['jam nope.wav', 'jam tom.wav'])
  await settle()
  const [player] = live('Player')
  expect(player.options.url.raw).toEqual({ decoded: 'TOM' })
  s.attack('drums', 'tom')
  s.attack('drums', 'gone')
  expect(calls.filter(c => c[0] === 'Player')).toEqual([['Player', 'start', 0.1, 0, 0.5]])
  s.use(jam(), 'jam')
  expect(besides).toHaveLength(2)
  expect(error).not.toHaveBeenCalled()
  expect(warn).not.toHaveBeenCalled()
})

test('the field the music names chooses the project: the first starts at once, a change waits for the next bar line of the one heard', async () => {
  const s = synthaudio()
  rows.push({ id: 1, kind: 'setlist', data: { song: null } })
  s.tick(plugins)
  expect(s.playing()).toBeUndefined()
  rows[0].data.song = 'jam'
  s.tick(plugins)
  await settle()
  // Every note of every clip, in ticks, so a change of tempo keeps every note where it was written.
  expect(calls).toContainEqual(['part', [['0i', 'lead', 'C4', '96i', 0.8], ['192i', 'drums', 'snare', '48i', 1], ['960i', 'drums', 'snare', '48i', 1]], '1536i'])
  expect(transport.bpms).toEqual([[120, 0.1]])
  clock.now = 0.1 + 5.5 * q
  expect(s.playing()).toBe('jam')
  expect(s.project()!.bpm).toBe(120)
  expect(s.position()).toBeCloseTo(5.5)
  expect(s.at()).toBe(5)

  // A note of the part plays on the project's own track, unless the track is quiet.
  parts[0].cb(1, { track: 'drums', note: 'snare', dur: '48i', vel: 1 })
  expect(calls).toContainEqual(['NoiseSynth', 'play', '48i', 1, 1])
  s.quiet(['drums'])
  calls.length = 0
  parts[0].cb(2, { track: 'drums', note: 'snare', dur: '48i', vel: 1 })
  parts[0].cb(2, { track: 'lead', note: 'C4', dur: '96i', vel: 1 })
  expect(calls).toEqual([['MonoSynth', 'play', 'C4', '96i', 2, 1]])
  s.quiet([])

  rows[0].data.song = 'groove'
  s.tick(plugins)
  await settle()
  const bar = clock.now + (16 - 5.5) * q
  expect(calls).toContainEqual(['part stop', bar])
  expect(transport.bpms.at(-1)).toEqual([96, bar])
  expect(s.playing()).toBe('jam')
  // Until the bar line both projects' instruments are there: the one heard rings on.
  expect(live('MonoSynth')).toHaveLength(1)
  expect(live('PolySynth')).toHaveLength(1)
  clock.now = bar
  expect(s.playing()).toBe('groove')
  expect(s.position()).toBeCloseTo(0)
  // The project it followed is gone, and its instruments with it.
  expect(live('MonoSynth')).toHaveLength(0)
  rows[0].data.song = 'nope'
  expect(() => s.tick(plugins)).toThrow('no project nope, which setlist.song names')
})

test('with a fade the music fades out over it, changes, and fades back in over as long', async () => {
  table.music = { kind: 'setlist', path: 'song', fade: 2 }
  const s = synthaudio()
  rows.push({ id: 1, kind: 'setlist', data: { song: 'jam' } })
  s.tick(plugins)
  await settle()
  clock.now = 1
  rows[0].data.song = null
  s.tick(plugins)
  await settle()
  const fader = made.filter(m => m.type === 'Gain')[0]
  expect(fader.ramps).toEqual([[0, 3.1], [1, 5.1]])
  expect(calls).toContainEqual(['part stop', 3.1])
  clock.now = 3.2
  expect(s.playing()).toBeUndefined()
  delete table.music!.fade
})

test('an audition starts where it is asked to, and is heard from there; play takes a project by name and refuses another', async () => {
  const s = synthaudio()
  s.tick(plugins)
  clock.now = 2
  s.audition(jam(), 'jam', 36)
  // 36 sixteenths into a project of 32 is 4 into it.
  expect(calls).toContainEqual(['part start', `${Math.round(2.1 * 384)}i`, '192i'])
  clock.now = 2.1 + q
  expect(s.position()).toBeCloseTo(5)
  expect(s.playing()).toBe('')
  await expect(s.play('nope')).rejects.toThrow('synthaudio has no project nope')
  await s.play('groove')
  clock.now += 0.2
  expect(s.playing()).toBe('groove')
  s.stop()
  expect(s.playing()).toBeUndefined()
})

test('the volume is the store\'s', () => {
  const s = synthaudio()
  const store = { level: 0.4, muted: false }
  const p = { ...plugins, wire: { ...plugins.wire, scene: { world: { synthaudio: { ...table, volume: { level: 'level', muted: 'muted' } } } } }, store: { get: (k: 'level' | 'muted') => store[k] } }
  s.tick(p)
  const volume = made.filter(m => m.type === 'Gain')[1]
  expect(volume.gain.value).toBe(0.4)
  store.muted = true
  s.tick(p)
  expect(volume.gain.value).toBe(0)
})
