// A project checked, flattened and edited, with no Web Audio: every rule the header gives, on a
// project of a monosynth, a drumkit and a sampler.
import { expect, test } from 'vitest'
import {
  addClip, addNote, addPattern, addTrack, changeInstrument, check, flatten, keep, load, midi, named, removeClip, removeNote,
  removePattern, removeTrack, renamePattern, renameTrack, resizePattern, samples, set, setClip, setNote, setPad, setSong, step,
  type Params, type Project,
} from './synthaudio.sim.ts'

const round: Params = { wave: 'square', attack: 0.01, decay: 0.1, sustain: 0.6, release: 0.3, cutoff: 900, resonance: 2, echo: 0.3, room: 0.1, gain: 0.7, pan: -0.1 }
const acid: Params = { ...round, wave: 'sawtooth', cutoff: 400, resonance: 12 }
const kit: Params = {
  pads: {
    kick: { voice: 'membrane', pitch: 'C1', decay: 0.4, gain: 1 },
    snare: { voice: 'noise', decay: 0.18, gain: 0.5 },
    hat: { voice: 'metal', pitch: 'G3', decay: 0.06, gain: 0.2 },
    tom: { voice: 'sample', sample: 'samples/tom.wav', decay: 0.5, gain: 0.8 },
  },
  echo: 0, room: 0.1, gain: 0.8, pan: 0,
}
const keys: Params = { samples: { C3: 'samples/piano-c3.wav', C4: 'samples/piano-c4.wav' }, attack: 0, release: 1, cutoff: 8000, resonance: 0, echo: 0, room: 0.2, gain: 0.6, pan: 0 }

const project = (): Project => ({
  bpm: 96,
  length: 64,
  master: { compressor: { threshold: -18, ratio: 3, attack: 0.01, release: 0.2 }, limiter: -1, echo: { time: '8n', feedback: 0.3 }, room: { decay: 2.5 } },
  tracks: {
    bass: {
      instrument: { is: 'monosynth', params: { ...round }, presets: { round, acid }, loaded: 'round' },
      patterns: { walk: { length: 32, notes: [[0, 'A2', 2, 0.9], [4, 'C3', 2, 0.8], [30, 'E3', 4, 0.7]] } },
      clips: [[16, 'walk', 2]],
    },
    drums: {
      instrument: { is: 'drumkit', params: structuredClone(kit), presets: { tight: kit }, loaded: 'tight' },
      patterns: { beat: { length: 16, notes: [[0, 'kick', 1, 1], [4, 'snare', 1, 0.9], [8, 'tom', 1, 0.8]] } },
      clips: [[0, 'beat', 4]],
    },
    keys: {
      instrument: { is: 'sampler', params: structuredClone(keys), presets: {}, loaded: null },
      patterns: {},
      clips: [],
    },
  },
})

test('a project of every kind of track checks', () => {
  expect(() => check(project())).not.toThrow()
})

test('check names where a project goes wrong', () => {
  const bad = (f: (p: any) => void) => { const p: any = project(); f(p); return () => check(p) }
  expect(bad(p => { p.bpm = 0 })).toThrow('bpm is not above 0')
  expect(bad(p => { p.length = 1.5 })).toThrow('length is 1.5')
  expect(bad(p => { delete p.master.room })).toThrow('master has no room')
  expect(bad(p => { p.tracks.bass.instrument.is = 'theremin' })).toThrow('tracks.bass.instrument.is is "theremin"')
  expect(bad(p => { delete p.tracks.bass.instrument.params.cutoff })).toThrow('tracks.bass.instrument.params has no cutoff')
  expect(bad(p => { p.tracks.bass.instrument.params.harmonicity = 2 })).toThrow('params has harmonicity, which it does not take')
  expect(bad(p => { p.tracks.bass.instrument.params.wave = 'pulse' })).toThrow('params.wave is "pulse"')
  // A preset of a monosynth's bank holds a monosynth's params and nothing else.
  expect(bad(p => { p.tracks.bass.instrument.presets.sub = { wave: 'sine' } })).toThrow('tracks.bass.instrument.presets.sub has no attack')
  expect(bad(p => { p.tracks.drums.instrument.params.pads.kick.voice = 'cowbell' })).toThrow('pads.kick.voice is "cowbell"')
  expect(bad(p => { delete p.tracks.drums.instrument.params.pads.tom.sample })).toThrow('pads.tom has no sample')
  expect(bad(p => { p.tracks.drums.instrument.params.pads.snare.pitch = 'C2' })).toThrow('pads.snare has pitch, which it does not take')
  expect(bad(p => { p.tracks.keys.instrument.params.samples.H9 = 'x.wav' })).toThrow('has H9, which is not a note')
  expect(bad(p => { p.tracks.bass.patterns.walk.notes.push([32, 'A2', 1, 1]) })).toThrow('notes[3][0] is 32, past the pattern\'s length 32')
  expect(bad(p => { p.tracks.bass.patterns.walk.notes.push([1, 'kick', 1, 1]) })).toThrow('notes[3][1] is "kick", and not a note')
  expect(bad(p => { p.tracks.drums.patterns.beat.notes.push([1, 'C1', 1, 1]) })).toThrow('notes[3][1] is "C1", and not a pad of the drumkit')
  expect(bad(p => { p.tracks.bass.patterns.walk.notes.push([1, 'A2', 0, 1]) })).toThrow('notes[3][2] is 0')
  expect(bad(p => { p.tracks.bass.clips.push([0, 'riff', 1]) })).toThrow('clips[1][1] is "riff", and not a pattern of the track')
  expect(bad(p => { p.tracks.bass.clips.push([0, 'walk', 0]) })).toThrow('clips[1][2] is 0')
})

test('flatten plays each clip\'s pattern as many times as it repeats, from where it is, and nothing past the song\'s end', () => {
  const played = flatten(project())
  const bass = played.filter(n => n.track === 'bass').map(n => [n.at, n.note, n.len, n.vel])
  // The walk at 16 and again at 48; its second pass's notes from 64 on are past the song.
  expect(bass).toEqual([[16, 'A2', 2, 0.9], [20, 'C3', 2, 0.8], [46, 'E3', 4, 0.7], [48, 'A2', 2, 0.9], [52, 'C3', 2, 0.8]])
  const kicks = played.filter(n => n.note === 'kick').map(n => n.at)
  expect(kicks).toEqual([0, 16, 32, 48])
  expect(played.map(n => n.at)).toEqual([...played.map(n => n.at)].sort((a, b) => a - b))
  expect(played.some(n => n.track === 'keys')).toBe(false)
})

test('samples are every path a drumkit or a sampler names, once', () => {
  const p = project()
  p.tracks.keys.instrument.params.samples.D4 = 'samples/tom.wav'
  expect(samples(p).sort()).toEqual(['samples/piano-c3.wav', 'samples/piano-c4.wav', 'samples/tom.wav'])
})

test('loading a preset copies it over the params and names it; changing a param leaves the preset as it was', () => {
  const p = project()
  load(p, 'bass', 'acid')
  expect(p.tracks.bass.instrument.params).toEqual(acid)
  expect(p.tracks.bass.instrument.loaded).toBe('acid')
  set(p, 'bass', ['cutoff'], 1200)
  expect(p.tracks.bass.instrument.params.cutoff).toBe(1200)
  expect(p.tracks.bass.instrument.presets.acid.cutoff).toBe(400)
  expect(p.tracks.bass.instrument.loaded).toBe('acid')
  expect(() => load(p, 'bass', 'sub')).toThrow('track bass\'s monosynth has no preset sub')
})

test('loading a kit without a pad the patterns hit takes those notes away with it, and keeps the rest', () => {
  const p = project()
  const small = { ...kit, pads: { kick: kit.pads.kick, snare: kit.pads.snare } }
  p.tracks.drums.instrument.presets.small = small
  load(p, 'drums', 'small')
  expect(p.tracks.drums.patterns.beat.notes.map(n => n[1])).toEqual(['kick', 'snare'])
  expect(() => check(p)).not.toThrow()
})

test('keeping a preset copies the params into the bank, and it is a copy', () => {
  const p = project()
  set(p, 'bass', ['release'], 0.8)
  keep(p, 'bass', 'long')
  expect(p.tracks.bass.instrument.presets.long).toEqual({ ...round, release: 0.8 })
  expect(p.tracks.bass.instrument.loaded).toBe('long')
  set(p, 'bass', ['release'], 0.1)
  expect(p.tracks.bass.instrument.presets.long.release).toBe(0.8)
  expect(() => check(p)).not.toThrow()
})

test('set takes only a value the param takes, at a path it has, and changes nothing otherwise', () => {
  const p = project()
  set(p, 'drums', ['pads', 'kick', 'decay'], 0.6)
  expect(p.tracks.drums.instrument.params.pads.kick.decay).toBe(0.6)
  expect(() => set(p, 'bass', ['wave'], 'pulse')).toThrow('params.wave is "pulse"')
  expect(() => set(p, 'bass', ['harmonicity'], 2)).toThrow('track bass has no param harmonicity')
  expect(() => set(p, 'drums', ['pads', 'cowbell', 'decay'], 1)).toThrow('track drums has no param pads.cowbell.decay')
  expect(p.tracks.bass.instrument.params.wave).toBe('square')
})

test('a pad added and taken away; taking one away takes its notes with it', () => {
  const p = project()
  setPad(p, 'drums', 'clap', { voice: 'noise', decay: 0.2, gain: 0.4 })
  expect(Object.keys(p.tracks.drums.instrument.params.pads)).toEqual(['kick', 'snare', 'hat', 'tom', 'clap'])
  setPad(p, 'drums', 'snare', undefined)
  expect(p.tracks.drums.patterns.beat.notes.map(n => n[1])).toEqual(['kick', 'tom'])
  expect(() => setPad(p, 'drums', 'rim', { voice: 'sample', decay: 1, gain: 1 })).toThrow('pads.rim has no sample')
  expect(() => setPad(p, 'bass', 'kick', kit.pads.kick)).toThrow('track bass is a monosynth, which has no pads')
  expect(() => check(p)).not.toThrow()
})

test('tracks added, renamed in their place and taken away', () => {
  const p = project()
  addTrack(p, 'lead', 'fmsynth', { bell: { wave: 'sine', attack: 0, decay: 1, sustain: 0, release: 1, harmonicity: 3, modulation: 10, echo: 0, room: 0.3, gain: 0.5, pan: 0 } })
  expect(Object.keys(p.tracks)).toEqual(['bass', 'drums', 'keys', 'lead'])
  expect(p.tracks.lead.instrument.loaded).toBe('bell')
  expect(p.tracks.lead.instrument.params).toEqual(p.tracks.lead.instrument.presets.bell)
  expect(() => addTrack(p, 'bass', 'synth', {})).toThrow('bass is taken')
  expect(() => addTrack(p, 'pad', 'synth', {})).toThrow('a synth needs a preset to start from')
  expect(() => addTrack(p, 'pad', 'synth', { warm: round })).toThrow('tracks.pad.instrument.params has cutoff, which it does not take')
  renameTrack(p, 'drums', 'kit')
  expect(Object.keys(p.tracks)).toEqual(['bass', 'kit', 'keys', 'lead'])
  removeTrack(p, 'keys')
  expect(Object.keys(p.tracks)).toEqual(['bass', 'kit', 'lead'])
  expect(() => check(p)).not.toThrow()
})

test('a new instrument on a track keeps its notes, but not across a drumkit and anything else', () => {
  const p = project()
  const fm = { e: { wave: 'sine', attack: 0, decay: 1, sustain: 0, release: 1, harmonicity: 3, modulation: 10, echo: 0, room: 0.3, gain: 0.5, pan: 0 } }
  changeInstrument(p, 'bass', 'fmsynth', fm)
  expect(p.tracks.bass.instrument.is).toBe('fmsynth')
  expect(p.tracks.bass.patterns.walk.notes).toHaveLength(3)
  expect(p.tracks.bass.clips).toEqual([[16, 'walk', 2]])
  expect(Object.keys(p.tracks)).toEqual(['bass', 'drums', 'keys'])
  changeInstrument(p, 'drums', 'fmsynth', fm)
  expect(p.tracks.drums.patterns).toEqual({})
  expect(p.tracks.drums.clips).toEqual([])
  expect(() => check(p)).not.toThrow()
})

test('patterns added, renamed with their clips, shortened and taken away with their clips', () => {
  const p = project()
  addPattern(p, 'bass', 'fill', 16)
  expect(p.tracks.bass.patterns.fill).toEqual({ length: 16, notes: [] })
  expect(() => addPattern(p, 'bass', 'walk', 16)).toThrow('walk is taken')
  renamePattern(p, 'bass', 'walk', 'line')
  expect(p.tracks.bass.clips).toEqual([[16, 'line', 2]])
  resizePattern(p, 'bass', 'line', 16)
  expect(p.tracks.bass.patterns.line.notes.map(n => n[0])).toEqual([0, 4])
  removePattern(p, 'bass', 'line')
  expect(p.tracks.bass.clips).toEqual([])
  expect(() => check(p)).not.toThrow()
})

test('notes added, set, replaced at the same place, and taken away', () => {
  const p = project()
  expect(addNote(p, 'bass', 'walk', [8, 'G2', 1, 0.5])).toBe(3)
  expect(addNote(p, 'bass', 'walk', [8, 'G2', 3, 1])).toBe(3)
  expect(p.tracks.bass.patterns.walk.notes[3]).toEqual([8, 'G2', 3, 1])
  setNote(p, 'bass', 'walk', 3, [9, 'A2', 2, 1])
  expect(p.tracks.bass.patterns.walk.notes[3]).toEqual([9, 'A2', 2, 1])
  expect(() => setNote(p, 'bass', 'walk', 3, [40, 'A2', 2, 1])).toThrow('is 40, past the pattern\'s length 32')
  expect(() => addNote(p, 'drums', 'beat', [2, 'cowbell', 1, 1])).toThrow('not a pad of the drumkit')
  removeNote(p, 'bass', 'walk', 0)
  expect(p.tracks.bass.patterns.walk.notes.map(n => n[1])).toEqual(['C3', 'E3', 'A2'])
  expect(() => check(p)).not.toThrow()
})

test('a step hits and unhits', () => {
  const p = project()
  expect(step(p, 'drums', 'beat', 2, 'hat', 0.6)).toBe(true)
  expect(p.tracks.drums.patterns.beat.notes).toContainEqual([2, 'hat', 1, 0.6])
  expect(step(p, 'drums', 'beat', 2, 'hat', 0.6)).toBe(false)
  expect(p.tracks.drums.patterns.beat.notes.some(n => n[0] === 2)).toBe(false)
})

test('clips added, set and taken away', () => {
  const p = project()
  expect(addClip(p, 'bass', [0, 'walk', 1])).toBe(1)
  setClip(p, 'bass', 1, [32, 'walk', 1])
  expect(p.tracks.bass.clips).toEqual([[16, 'walk', 2], [32, 'walk', 1]])
  expect(() => addClip(p, 'bass', [0, 'riff', 1])).toThrow('track bass has no pattern riff')
  expect(() => setClip(p, 'bass', 1, [0, 'walk', 0])).toThrow('the clip\'s repeats is 0')
  removeClip(p, 'bass', 0)
  expect(p.tracks.bass.clips).toEqual([[32, 'walk', 1]])
})

test('the song\'s tempo and length', () => {
  const p = project()
  setSong(p, 120, 128)
  expect([p.bpm, p.length]).toEqual([120, 128])
  expect(() => setSong(p, 0, 64)).toThrow('bpm is above 0')
  expect(() => setSong(p, 120, 0)).toThrow('length is 0')
})

test('a note\'s name as MIDI counts it, and back', () => {
  expect(midi('C4')).toBe(60)
  expect(midi('Bb3')).toBe(58)
  expect(named(61)).toBe('C#4')
  expect(() => midi('H2')).toThrow('H2 is not a note')
})
