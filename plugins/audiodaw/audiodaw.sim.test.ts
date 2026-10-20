import { describe, expect, it } from 'vitest'
import {
  addBus, addClip, addDevice, addEffect, addNote, addPattern, addTrack, clipEnd, clipLength, deviceFrom,
  loadPreset, moveClip, moveClipsTo, moveDevice, moveEffect, moveNote, moveTrack,
  removeBus, removeClip, removeDevice, removeEffect, removeNote, removePattern, removeSend, removeTrack,
  renamePattern, setChannel, setEffect, setFrom, setInstrument, setLength, setSend, setTarget, setTrack,
  putEffect, putInstrument, sounds, spanOf, turnEffect, uniqueClip,
  noteTrack, automationTrack, automationNote, addAutomationPattern, addAutomationNote, moveAutomationNote,
  removeAutomationNote, addPoint, movePoint, removePoint, setKnob,
  type AutomationTrack, type Device, type Knob, type NoteTrack, type Project,
} from './audiodaw.sim'

function lead(name = 'lead'): Device {
  return {
    name,
    instrument: { is: 'MonoSynth', options: { oscillator: { type: 'sawtooth' }, filter: { Q: 2 } } },
    effects: [{ is: 'Distortion', on: true, options: { distortion: 0.4 } }],
    channel: { volume: 0, pan: 0, mute: false, solo: false },
    sends: { verb: -12 },
  }
}

function track(name: string, target?: number): NoteTrack {
  return {
    kind: 'notes', name, color: '#f80',
    ...(target === undefined ? {} : { target }),
    patterns: { a: { length: 768, notes: [{ time: 0, note: 'C3', duration: 192, velocity: 1 }] } },
    mute: false, solo: false,
  }
}

function song(): Project {
  return {
    bpm: 120, timeSignature: 4, swing: 0, swingSubdivision: '8n', ppq: 192,
    rack: [lead(), lead('bass')],
    tracks: [track('one', 0), track('two', 0), track('three', 1)],
    buses: { verb: { volume: 0, pan: 0, effects: [] } },
    master: { volume: 0, effects: [] },
    clips: [{ track: 0, pattern: 'a', start: 0 }, { track: 1, pattern: 'a', start: 768 }, { track: 2, pattern: 'a', start: 384 }],
  }
}

// Every edit leaves the project it was handed exactly as it was.
function untouched(p: Project, edit: (p: Project) => Project): Project {
  const before = structuredClone(p)
  const out = edit(p)
  expect(p).toEqual(before)
  return out
}

describe('audiodaw clip arithmetic', () => {
  it('plays a pattern from its from to its length, once', () => {
    const p = song()
    const trimmed = setFrom(setLength(p, 1, 'a', 1000), 1, 'a', 200)
    expect(clipLength(trimmed, trimmed.clips[1]!)).toBe(800)
    expect(clipEnd(trimmed, trimmed.clips[1]!)).toBe(968 + 800)
  })

  it('bounds the song by its span, else from 0 to the last clip end', () => {
    const p = song()
    expect(spanOf(p)).toEqual({ start: 0, end: 1536 })
    expect(spanOf({ ...p, clips: [] })).toEqual({ start: 0, end: 0 })
    expect(spanOf({ ...p, span: { start: 100, end: 200 } })).toEqual({ start: 100, end: 200 })
  })

  it('lets a track through unless muted, or another is soloed', () => {
    const p = song()
    expect([0, 1, 2].map((t) => sounds(p, t))).toEqual([true, true, true])
    const muted = setTrack(p, 1, 'mute', true)
    expect([0, 1, 2].map((t) => sounds(muted, t))).toEqual([true, false, true])
    const soloed = setTrack(p, 2, 'solo', true)
    expect([0, 1, 2].map((t) => sounds(soloed, t))).toEqual([false, false, true])
    expect(sounds(setTrack(soloed, 2, 'mute', true), 2)).toBe(false)
    // A device's channel mute is Tone's, and holds back no track's notes.
    expect(sounds(setChannel(p, 0, 'mute', true), 0)).toBe(true)
  })
})

describe('audiodaw note and clip edits', () => {
  it('adds, moves and removes a note', () => {
    const p = song()
    const added = untouched(p, (x) => addNote(x, 0, 'a', { time: 192, note: 'E3', duration: 96, velocity: 0.5 }))
    expect(noteTrack(added, 0).patterns.a!.notes).toHaveLength(2)
    const moved = untouched(added, (x) => moveNote(x, 0, 'a', 1, { time: 384, note: 'G3' }))
    expect(noteTrack(moved, 0).patterns.a!.notes[1]).toEqual({ time: 384, note: 'G3', duration: 96, velocity: 0.5 })
    expect(noteTrack(untouched(moved, (x) => removeNote(x, 0, 'a', 0)), 0).patterns.a!.notes.map((n) => n.note)).toEqual(['G3'])
  })

  it('adds, moves and removes a clip of a pattern its track has', () => {
    const p = song()
    const added = untouched(p, (x) => addClip(x, { track: 0, pattern: 'a', start: 1536 }))
    expect(added.clips[3]).toEqual({ track: 0, pattern: 'a', start: 1536 })
    expect(untouched(added, (x) => moveClip(x, 3, { start: 3072 })).clips[3]).toEqual({ track: 0, pattern: 'a', start: 3072 })
    expect(moveClip(added, 3, { track: 2 }).clips[3]!.track).toBe(2)
    expect(untouched(added, (x) => removeClip(x, 0)).clips).toEqual(added.clips.slice(1))
  })
})

describe('audiodaw track edits', () => {
  it('adds a track, targeting a device there is or none', () => {
    const p = song()
    const added = untouched(p, (x) => addTrack(x, track('four', 1)))
    expect(added.tracks.map((t) => t.name)).toEqual(['one', 'two', 'three', 'four'])
    expect(addTrack(p, track('none')).tracks[3]!.target).toBeUndefined()
  })

  it('removes a track with its clips, the later clips following it down', () => {
    const p = song()
    const gone = untouched(p, (x) => removeTrack(x, 1))
    expect(gone.tracks.map((t) => t.name)).toEqual(['one', 'three'])
    expect(gone.clips).toEqual([{ track: 0, pattern: 'a', start: 0 }, { track: 1, pattern: 'a', start: 384 }])
  })

  it('sets and clears a track target', () => {
    const p = song()
    expect(untouched(p, (x) => setTarget(x, 0, 1)).tracks[0]!.target).toBe(1)
    const none = untouched(p, (x) => setTarget(x, 0, undefined))
    expect('target' in none.tracks[0]!).toBe(false)
  })

  it('moves a track, its clips with it', () => {
    const p = song()
    const moved = untouched(p, (x) => moveTrack(x, 0, 2))
    expect(moved.tracks.map((t) => t.name)).toEqual(['two', 'three', 'one'])
    expect(moved.clips.map((c) => c.track)).toEqual([2, 0, 1])
    const back = moveTrack(p, 2, 0)
    expect(back.tracks.map((t) => t.name)).toEqual(['three', 'one', 'two'])
    expect(back.clips.map((c) => c.track)).toEqual([1, 2, 0])
  })
})

describe('audiodaw rack edits', () => {
  it('adds a device, and makes one from a preset', () => {
    const p = song()
    const preset = { name: 'Pad', instrument: { is: 'Synth', voices: 6, options: { volume: -6 } }, effects: [{ is: 'Chorus', on: true, options: {} }] }
    const made = deviceFrom('pad', preset)
    expect(made).toEqual({ name: 'pad', instrument: preset.instrument, effects: preset.effects, channel: { volume: 0, pan: 0, mute: false, solo: false }, sends: {} })
    expect(deviceFrom('bare', { name: 'x', instrument: { is: 'Synth', options: {} } }).effects).toEqual([])
    const added = untouched(p, (x) => addDevice(x, made))
    expect(added.rack.map((d) => d.name)).toEqual(['lead', 'bass', 'pad'])
  })

  it('removes a device, its tracks targeting none and later targets following it down', () => {
    const p = addTrack(addDevice(song(), lead('pad')), track('four', 2))
    const gone = untouched(p, (x) => removeDevice(x, 0))
    expect(gone.rack.map((d) => d.name)).toEqual(['bass', 'pad'])
    expect(gone.tracks.map((t) => t.target)).toEqual([undefined, undefined, 0, 1])
    expect('target' in gone.tracks[0]!).toBe(false)
    const middle = removeDevice(p, 1)
    expect(middle.tracks.map((t) => t.target)).toEqual([0, 0, undefined, 1])
  })

  it('moves a device, every track keeping its device', () => {
    const p = addTrack(addDevice(song(), lead('pad')), track('four', 2))
    const moved = untouched(p, (x) => moveDevice(x, 0, 2))
    expect(moved.rack.map((d) => d.name)).toEqual(['bass', 'pad', 'lead'])
    expect(moved.tracks.map((_, t) => moved.rack[noteTrack(moved, t).target!]!.name)).toEqual(['lead', 'lead', 'bass', 'pad'])
    const none = setTarget(p, 3, undefined)
    expect(moveDevice(none, 2, 0).tracks[3]!.target).toBeUndefined()
  })

  it('sets and removes a send to a bus there is', () => {
    const p = song()
    expect(untouched(p, (x) => setSend(x, 0, 'verb', -3)).rack[0]!.sends).toEqual({ verb: -3 })
    expect(untouched(p, (x) => removeSend(x, 0, 'verb')).rack[0]!.sends).toEqual({})
  })

  it('adds, removes, moves, sets and turns off an effect on a device, a bus and the master', () => {
    const p = song()
    const chorus = { is: 'Chorus', on: true, options: { frequency: 2 } }
    const two = untouched(p, (x) => addEffect(x, { device: 0 }, chorus, 0))
    expect(two.rack[0]!.effects.map((e) => e.is)).toEqual(['Chorus', 'Distortion'])
    expect(addEffect(p, { device: 0 }, chorus).rack[0]!.effects.map((e) => e.is)).toEqual(['Distortion', 'Chorus'])
    expect(untouched(two, (x) => moveEffect(x, { device: 0 }, 0, 1)).rack[0]!.effects.map((e) => e.is)).toEqual(['Distortion', 'Chorus'])
    expect(untouched(two, (x) => removeEffect(x, { device: 0 }, 1)).rack[0]!.effects.map((e) => e.is)).toEqual(['Chorus'])
    expect(untouched(p, (x) => setEffect(x, { device: 0 }, 0, { oversample: '4x' })).rack[0]!.effects[0]!.options)
      .toEqual({ distortion: 0.4, oversample: '4x' })
    expect(untouched(p, (x) => turnEffect(x, { device: 0 }, 0, false)).rack[0]!.effects[0]!.on).toBe(false)
    const verb = untouched(p, (x) => addEffect(x, { bus: 'verb' }, { is: 'Reverb', on: true, options: { decay: 3 } }))
    expect(verb.buses.verb!.effects).toHaveLength(1)
    expect(setEffect(verb, { bus: 'verb' }, 0, { decay: 5 }).buses.verb!.effects[0]!.options).toEqual({ decay: 5 })
    const comp = untouched(p, (x) => addEffect(x, 'master', { is: 'Compressor', on: true, options: {} }))
    expect(comp.master.effects[0]!.is).toBe('Compressor')
    expect(turnEffect(comp, 'master', 0, false).master.effects[0]!.on).toBe(false)
    expect(removeEffect(comp, 'master', 0).master.effects).toEqual([])
  })

  it('adds a bus, and removes one with every device send to it', () => {
    const p = song()
    const added = untouched(p, (x) => addBus(x, 'delay', { volume: -3, pan: 0, effects: [] }))
    expect(Object.keys(added.buses)).toEqual(['verb', 'delay'])
    const both = setSend(added, 0, 'delay', -6)
    const gone = untouched(both, (x) => removeBus(x, 'verb'))
    expect(Object.keys(gone.buses)).toEqual(['delay'])
    expect(gone.rack.map((d) => d.sends)).toEqual([{ delay: -6 }, {}])
  })

  it('loads a preset into a device instrument alone, and sets one instrument setting', () => {
    const p = song()
    const preset = { name: 'Chorale 6', instrument: { is: 'Synth', voices: 6, options: {} }, effects: [{ is: 'Chorus', on: true, options: {} }] }
    const loaded = untouched(p, (x) => loadPreset(x, 0, preset))
    expect(loaded.rack[0]!.instrument).toEqual(preset.instrument)
    expect(loaded.rack[0]!.effects).toEqual(p.rack[0]!.effects)
    expect(loaded.rack[0]!.sends).toEqual(p.rack[0]!.sends)
    expect(loaded.rack[0]!.channel).toEqual(p.rack[0]!.channel)
    expect(untouched(p, (x) => setInstrument(x, 0, { filter: { type: 'lowpass' } })).rack[0]!.instrument.options)
      .toEqual({ oscillator: { type: 'sawtooth' }, filter: { Q: 2, type: 'lowpass' } })
    expect(setInstrument(p, 0, { oscillator: { partials: [1, 2] } }).rack[0]!.instrument.options)
      .toEqual({ oscillator: { type: 'sawtooth', partials: [1, 2] }, filter: { Q: 2 } })
  })

  it('puts an instrument and an effect in place whole, merging nothing', () => {
    const p = song()
    const fm = { is: 'FMSynth', voices: 4, options: { oscillator: { type: 'sine' } } }
    const put = untouched(p, (x) => putInstrument(x, 0, fm))
    expect(put.rack[0]!.instrument).toBe(fm)
    const crushed = { is: 'Distortion', on: false, options: { oversample: '2x' } }
    const swapped = untouched(p, (x) => putEffect(x, { device: 0 }, 0, crushed))
    expect(swapped.rack[0]!.effects).toEqual([crushed])
  })
})

// The lead's Distortion amount, as an automation track would aim at it.
const drive: Knob = { part: 'effect', chain: { device: 0 }, effect: 0, path: ['distortion'] }

function knob(name: string, target?: Knob): AutomationTrack {
  return { kind: 'automation', name, color: '#0af', ...(target ? { target } : {}), patterns: {}, mute: false }
}

// The song with a fourth track, automating `target`, playing pattern `a`: one automation note from
// tick 0 to 384, 0.2 to 0.9, under a clip at 0.
function automated(target: Knob = drive): Project {
  const p = addAutomationPattern(addTrack(song(), knob('drive', target)), 3, 'a', { length: 768, notes: [] })
  return addClip(addAutomationNote(p, 3, 'a', automationNote(0, 384, 0.2, 0.9)), { track: 3, pattern: 'a', start: 0 })
}

describe('audiodaw automation tracks', () => {
  it('aims a track at a knob, and a clip plays its pattern of automation notes', () => {
    const p = automated()
    expect(automationTrack(p, 3).target).toEqual(drive)
    expect(automationTrack(p, 3).patterns.a!.notes).toEqual([{ time: 0, duration: 384, points: [{ at: 0, value: 0.2, shape: 'linear' }, { at: 384, value: 0.9, shape: 'linear' }] }])
    expect(clipEnd(p, p.clips[3]!)).toBe(768)
    expect(sounds(p, 3)).toBe(true)
    expect(sounds(setTrack(p, 3, 'mute', true), 3)).toBe(false)
    // Soloing a note track holds back other note tracks' notes, not a knob's values.
    expect(sounds(setTrack(p, 0, 'solo', true), 3)).toBe(true)
  })

  it('retargets a track to another knob', () => {
    const p = automated()
    const send: Knob = { part: 'send', device: 1, bus: 'verb' }
    expect(automationTrack(setKnob(p, 3, send), 3).target).toEqual(send)
    expect('target' in automationTrack(setKnob(p, 3, undefined), 3)).toBe(false)
  })

  it('stretches an automation note, its points keeping their place in it', () => {
    const p = addPoint(automated(), 3, 'a', 0, { at: 96, value: 0.5, shape: 'exp' })
    const longer = moveAutomationNote(p, 3, 'a', 0, { time: 192, duration: 768 })
    expect(automationTrack(longer, 3).patterns.a!.notes[0]).toEqual({
      time: 192, duration: 768,
      points: [{ at: 0, value: 0.2, shape: 'linear' }, { at: 192, value: 0.5, shape: 'exp' }, { at: 768, value: 0.9, shape: 'linear' }],
    })
  })

  it('adds, reshapes and removes a point, keeping the start and end', () => {
    const p = addPoint(automated(), 3, 'a', 0, { at: 200, value: 0.6, shape: 'step' })
    const reshaped = movePoint(p, 3, 'a', 0, 1, { at: 100, value: 0.1, shape: 'exp' })
    expect(automationTrack(reshaped, 3).patterns.a!.notes[0]!.points[1]).toEqual({ at: 100, value: 0.1, shape: 'exp' })
    // The end point's value moves; its place stays at the note's end.
    const end = movePoint(p, 3, 'a', 0, 2, { at: 10, value: 0 })
    expect(automationTrack(end, 3).patterns.a!.notes[0]!.points[2]).toEqual({ at: 384, value: 0, shape: 'linear' })
    expect(automationTrack(removePoint(p, 3, 'a', 0, 1), 3).patterns.a!.notes[0]!.points.map(q => q.at)).toEqual([0, 384])
    expect(automationTrack(removeAutomationNote(p, 3, 'a', 0), 3).patterns.a!.notes).toEqual([])
  })

  it('keeps every knob on its thing as devices and effects move, and lets go of one whose thing is gone', () => {
    const p = automated()
    // The lead moved after the bass: the knob follows it.
    expect(automationTrack(moveDevice(p, 0, 1), 3).target).toEqual({ ...drive, chain: { device: 1 } })
    // An effect put in front of the Distortion: the knob follows it along the chain.
    const chorus = { is: 'Chorus', on: true, options: {} }
    const fronted = addEffect(p, { device: 0 }, chorus, 0)
    expect(automationTrack(fronted, 3).target).toEqual({ ...drive, effect: 1 })
    expect(automationTrack(moveEffect(fronted, { device: 0 }, 1, 0), 3).target).toEqual(drive)
    // The Distortion, or the lead, taken away: the track targets none.
    expect('target' in automationTrack(removeEffect(p, { device: 0 }, 0), 3)).toBe(false)
    expect('target' in automationTrack(removeDevice(p, 0), 3)).toBe(false)
    // A send's knob goes with its bus; an instrument's with its kind of instrument.
    expect('target' in automationTrack(removeBus(automated({ part: 'send', device: 0, bus: 'verb' }), 'verb'), 3)).toBe(false)
    const cutoff: Knob = { part: 'instrument', device: 0, path: ['filterEnvelope', 'baseFrequency'] }
    const mono = { name: 'Round', instrument: { is: 'MonoSynth', options: {} } }
    const poly = { name: 'Pad', instrument: { is: 'Synth', options: {} } }
    expect(automationTrack(loadPreset(automated(cutoff), 0, mono), 3).target).toEqual(cutoff)
    expect('target' in automationTrack(loadPreset(automated(cutoff), 0, poly), 3)).toBe(false)
  })

  it('keeps a clip dragged onto a track of the other kind where it was', () => {
    const p = automated()
    expect(moveClipsTo(p, [0, 3], [3, 0]).clips).toEqual(p.clips)
  })
})

describe('audiodaw pattern edits', () => {
  it('sets a pattern length past its from, leaving its notes', () => {
    const p = song()
    const longer = untouched(p, (x) => setLength(x, 0, 'a', 1536))
    expect(longer.tracks[0]!.patterns.a).toEqual({ ...p.tracks[0]!.patterns.a, length: 1536 })
    expect(clipEnd(longer, longer.clips[0]!)).toBe(1536)
    const from = setFrom(p, 0, 'a', 100)
    expect(setLength(from, 0, 'a', 101).tracks[0]!.patterns.a!.length).toBe(101)
  })

  it('sets a pattern from, every clip of it moving so its notes stay put in the song', () => {
    const p = addClip(song(), { track: 0, pattern: 'a', start: 2000 })
    const moved = untouched(p, (x) => setFrom(x, 0, 'a', 192))
    expect(moved.tracks[0]!.patterns.a!.from).toBe(192)
    expect(moved.tracks[0]!.patterns.a!.notes).toEqual(p.tracks[0]!.patterns.a!.notes)
    expect(moved.clips.map((c) => c.start)).toEqual([192, 768, 384, 2192])
    // A note at pattern tick 300 sounds at clip.start - from + 300 before and after.
    for (const i of [0, 3]) expect(moved.clips[i]!.start - 192).toBe(p.clips[i]!.start)
    expect(clipEnd(moved, moved.clips[0]!)).toBe(clipEnd(p, p.clips[0]!))
    // Back to 0 puts every clip back.
    expect(setFrom(moved, 0, 'a', 0).clips).toEqual(p.clips)
  })

  it('adds, renames and removes a pattern, its clips following', () => {
    const p = song()
    const added = untouched(p, (x) => addPattern(x, 0, 'b', { length: 96, notes: [] }))
    expect(Object.keys(added.tracks[0]!.patterns)).toEqual(['a', 'b'])
    const renamed = untouched(added, (x) => renamePattern(x, 0, 'a', 'intro'))
    expect(Object.keys(renamed.tracks[0]!.patterns)).toEqual(['intro', 'b'])
    expect(renamed.clips.map((c) => c.pattern)).toEqual(['intro', 'a', 'a'])
    const removed = untouched(p, (x) => removePattern(x, 0, 'a'))
    expect(removed.tracks[0]!.patterns).toEqual({})
    expect(removed.clips).toEqual(p.clips.slice(1))
  })

  it('gives one clip a pattern copy of its own', () => {
    const p = addClip(song(), { track: 0, pattern: 'a', start: 768 })
    const own = untouched(p, (x) => uniqueClip(x, 3))
    expect(own.clips[3]).toEqual({ track: 0, pattern: 'a2', start: 768 })
    expect(own.clips[0]!.pattern).toBe('a')
    expect(own.tracks[0]!.patterns.a2).toEqual(p.tracks[0]!.patterns.a)
    expect(own.tracks[0]!.patterns.a2).not.toBe(p.tracks[0]!.patterns.a)
    expect(uniqueClip(own, 0).clips[0]!.pattern).toBe('a3')
  })

  it('moves clips to other tracks, carrying their pattern once', () => {
    const p = addClip(song(), { track: 0, pattern: 'a', start: 768 })
    // Track 2 has its own pattern a: track 0's goes in as a2, once for both clips.
    const moved = untouched(p, (x) => moveClipsTo(x, [0, 3], [2, 2]))
    expect(moved.clips[0]).toEqual({ track: 2, pattern: 'a2', start: 0 })
    expect(moved.clips[3]).toEqual({ track: 2, pattern: 'a2', start: 768 })
    expect(moved.tracks[2]!.patterns.a2).toBe(p.tracks[0]!.patterns.a)
    expect(moved.tracks[2]!.patterns.a).toBe(p.tracks[2]!.patterns.a)
    expect(Object.keys(moved.tracks[2]!.patterns)).toEqual(['a', 'a2'])
    // A track already holding the very pattern under its name plays that one.
    const shared = { ...p, tracks: p.tracks.map((t, i) => (i === 2 ? { ...noteTrack(p, 2), patterns: { a: noteTrack(p, 0).patterns.a! } } : t)) }
    const again = moveClipsTo(shared, [0], [2])
    expect(again.clips[0]).toEqual({ track: 2, pattern: 'a', start: 0 })
    expect(again.tracks[2]).toBe(shared.tracks[2])
    // A free name on the destination keeps the pattern's own name.
    const fresh = addTrack(p, { ...track('four'), patterns: {} })
    expect(moveClipsTo(fresh, [1], [3]).clips[1]).toEqual({ track: 3, pattern: 'a', start: 768 })
    // A clip moved to its own track stays.
    expect(moveClipsTo(p, [0], [0]).clips).toEqual(p.clips)
  })
})
