import './nodeaudio'
import * as web from 'node-web-audio-api'
import * as Tone from 'tone'
import { describe, expect, it } from 'vitest'
import type { Plugins } from '#engine/browser.ts'
import { audiodaw, render } from './audiodaw.plugin'
import {
  addBus, addClip, addDevice, addEffect, addNote, addTrack, removeDevice, removeTrack, setChannel, setFrom, setLength,
  setSend, setTarget, setTrack, turnEffect, DRUM_KIT, automationNote, setKnob,
  type AutomationNote, type AutomationTrack, type Knob, type Range,
  type Device, type Instrument, type Note, type NoteTrack, type Project, type Track,
} from './audiodaw.sim'

// 120 bpm at 192 ticks a beat: 384 ticks a second.
const second = 384

const synth: Instrument = { is: 'Synth', options: { oscillator: { type: 'square' }, envelope: { attack: 0.001, decay: 0, sustain: 1, release: 0.001 } } }

function device(name: string, pan = 0, instrument: Instrument = synth): Device {
  return { name, instrument, effects: [], channel: { volume: 0, pan, mute: false, solo: false }, sends: {} }
}

function track(name: string, notes: Note[], length: number, target: number | null = 0): NoteTrack {
  return {
    kind: 'notes', name, color: '#fff',
    ...(target === null ? {} : { target }),
    patterns: { a: { length, notes } },
    mute: false, solo: false,
  }
}

// One clip of each track's pattern `a` at 0.
function project(rack: Device[], tracks: Track[]): Project {
  return {
    bpm: 120, timeSignature: 4, swing: 0, swingSubdivision: '8n', ppq: 192,
    rack,
    tracks,
    buses: {},
    master: { volume: 0, effects: [] },
    clips: tracks.map((_, t) => ({ track: t, pattern: 'a', start: 0 })),
  }
}

// A left device and a right one: channel 0 hears the first, channel 1 the second.
const stereo = () => [device('left', -1), device('right', 1)]

const note = (time: number, duration = 48, pitch = 'A4'): Note => ({ time, note: pitch, duration, velocity: 1 })

// The loudest sample of a channel between two times in seconds.
function peak(buffer: Tone.ToneAudioBuffer, from: number, to: number, channel = 0) {
  const data = buffer.toArray(channel) as Float32Array
  const rate = buffer.sampleRate
  let most = 0
  for (let i = Math.floor(from * rate); i < Math.min(data.length, Math.floor(to * rate)); i++) most = Math.max(most, Math.abs(data[i]!))
  return most
}

// The first time in seconds a channel is above a level.
function onset(buffer: Tone.ToneAudioBuffer, level = 0.05, channel = 0) {
  const data = buffer.toArray(channel) as Float32Array
  const i = data.findIndex((v) => Math.abs(v) > level)
  return i < 0 ? undefined : i / buffer.sampleRate
}

// An edit handed to the song at a time in seconds while it plays.
const at = (seconds: number, edit: () => Project) => (s: { edit(p: Project): void }) => {
  Tone.getTransport().schedule(() => s.edit(edit()), seconds)
}

// The render's transport stopped or paused at a time in seconds. It is the one made with the song:
// once the render runs, `Tone.getTransport()` is the page's again.
const halt = (how: 'stop' | 'pause', seconds: number) => () => {
  const transport = Tone.getTransport()
  transport.schedule((t) => transport[how](t), seconds)
}

// A test that plays in time, to no device, in a context of its own.
async function live(run: () => Promise<void>) {
  const was = Tone.getContext()
  Tone.setContext(new Tone.Context(new web.AudioContext({ sinkId: { type: 'none' } } as AudioContextOptions) as unknown as AudioContext))
  try {
    await run()
  } finally {
    await (Tone.getContext() as Tone.Context).close()
    Tone.setContext(was)
  }
}
const wait = (ms: number) => new Promise((done) => setTimeout(done, ms))

// An automation track aimed at `target`, its pattern `a` of `notes` two seconds long.
const automation = (target: Knob, notes: AutomationNote[], mute = false): AutomationTrack =>
  ({ kind: 'automation', name: 'auto', color: '#0af', target, patterns: { a: { length: 2 * second, notes } }, mute })
// A channel's volume travels −60 to 0 dB; a filter envelope's base 20 to 8000 Hz on the log curve.
const ranges = (k: Knob): Range => (k.part === 'volume' ? { min: -60, max: 0 } : { min: 20, max: 8000, curve: 'log' })
// A device at −12 dB holding one note for two seconds.
const held = (pan = 0): Device => ({ ...device('a', pan), channel: { volume: -12, pan, mute: false, solo: false } })

describe('audiodaw automation', () => {
  it("follows an automation note on a device's volume, and lets the volume go back when the note ends", async () => {
    // From 0.25 s to 0.75 s the volume rises from −60 dB to 0 dB; before and after, it is −12 dB.
    const p = project([held()], [track('a', [note(0, 2 * second)], 2 * second), automation({ part: 'volume', strip: { device: 0 } }, [automationNote(second / 4, second / 2, 0, 1)])])
    const out = await render(p, 1, undefined, ranges)
    const own = peak(out, 0.05, 0.2)
    expect(peak(out, 0.27, 0.32)).toBeLessThan(own / 4)
    expect(peak(out, 0.7, 0.74)).toBeGreaterThan(own * 1.5)
    expect(peak(out, 0.85, 1)).toBeCloseTo(own, 2)
  })

  it('holds a knob again on every pass of the loop', async () => {
    // A dip to −60 dB from 0.25 s to 0.5 s, in a loop of the first second.
    const dip = automationNote(second / 4, second / 4, 0, 0)
    const p = { ...project([held()], [track('a', [note(0, 4 * second)], 4 * second), automation({ part: 'volume', strip: { device: 0 } }, [dip])]), loop: { start: 0, end: second } }
    const out = await render(p, 2, () => { Tone.getTransport().loop = true }, ranges)
    const own = peak(out, 0.05, 0.2)
    for (const t of [0.3, 1.3]) expect(peak(out, t, t + 0.1)).toBeLessThan(own / 4)
    expect(peak(out, 1.6, 1.9)).toBeCloseTo(own, 2)
  })

  it('leaves a knob alone while its automation track is muted', async () => {
    const p = project([held()], [track('a', [note(0, 2 * second)], 2 * second), automation({ part: 'volume', strip: { device: 0 } }, [automationNote(second / 4, second / 2, 0, 0)], true)])
    const out = await render(p, 1, undefined, ranges)
    expect(peak(out, 0.3, 0.7)).toBeCloseTo(peak(out, 0.05, 0.2), 2)
  })

  it('moves the new knob from the next note of a track retargeted mid-song', async () => {
    // Dips at 0.25 s and 0.75 s; between them the track is aimed from the left device to the right.
    const dips = [automationNote(second / 4, second / 8, 0, 0), automationNote(0.75 * second, second / 8, 0, 0)]
    const p = project([held(-1), held(1)], [track('l', [note(0, 2 * second)], 2 * second, 0), track('r', [note(0, 2 * second)], 2 * second, 1), automation({ part: 'volume', strip: { device: 0 } }, dips)])
    const out = await render(p, 1, at(0.5, () => setKnob(p, 2, { part: 'volume', strip: { device: 1 } })), ranges)
    const [left, right] = [peak(out, 0.05, 0.2, 0), peak(out, 0.05, 0.2, 1)]
    expect(peak(out, 0.27, 0.3, 0)).toBeLessThan(left / 4)
    expect(peak(out, 0.27, 0.3, 1)).toBeCloseTo(right, 2)
    expect(peak(out, 0.77, 0.8, 1)).toBeLessThan(right / 4)
    expect(peak(out, 0.77, 0.8, 0)).toBeCloseTo(left, 2)
  })

  it("sets a knob Tone only sets on every 16th of an automation note, and back to its own at its end", async () => {
    // A MonoSynth's cutoff (its filter envelope's base, 130 Hz its own) from 20 Hz up to 8000 Hz over
    // a bar at 120 bpm: a 16th is an eighth of a second.
    await live(async () => {
      const daw = audiodaw()
      const mono: Instrument = { is: 'MonoSynth', options: { filterEnvelope: { baseFrequency: 130 } } }
      const cutoff: Knob = { part: 'instrument', device: 0, path: ['filterEnvelope', 'baseFrequency'] }
      const p = project([device('a', 0, mono)], [automation(cutoff, [automationNote(0, 4 * 192, 0, 1)])])
      daw.load(p, ranges)
      await daw.start()
      daw.play(0)
      const read = () => (daw.optionsOf(0) as { filterEnvelope: { baseFrequency: number } }).filterEnvelope.baseFrequency
      const seen: number[] = []
      for (let k = 0; k < 40; k++) {
        await wait(50)
        seen.push(read())
      }
      // Rising through the bar in steps, one value a 16th, then 130 Hz again once it ends.
      const rising = seen.slice(0, 36).filter((v, i, all) => i === 0 || v !== all[i - 1])
      expect(rising.length).toBeGreaterThanOrEqual(8)
      for (let i = 1; i < rising.length; i++) expect(rising[i]!).toBeGreaterThan(rising[i - 1]!)
      expect(seen.at(-1)).toBe(130)
      daw.dispose()
    })
  })
})

describe('audiodaw through Tone', () => {
  it('sounds a note at the time the transport puts it', async () => {
    const out = await render(project([device('a')], [track('a', [note(second)], 2 * second)]), 2)
    expect(onset(out)).toBeCloseTo(1, 2)
    expect(peak(out, 0, 0.99)).toBeLessThan(0.01)
  })

  it('plays a clip once, never repeating it past its pattern length', async () => {
    const out = await render(project([device('a')], [track('a', [note(0)], second / 2)]), 2)
    expect(peak(out, 0, 0.1)).toBeGreaterThan(0.1)
    expect(peak(out, 0.2, 2)).toBeLessThan(0.01)
  })

  it('plays two clips of one pattern, each once, where they start', async () => {
    const p = addClip(project([device('a')], [track('a', [note(0)], second / 2)]), { track: 0, pattern: 'a', start: second })
    const out = await render(p, 2)
    expect(peak(out, 0, 0.1)).toBeGreaterThan(0.1)
    expect(peak(out, 0.2, 0.95)).toBeLessThan(0.01)
    expect(peak(out, 1, 1.1)).toBeGreaterThan(0.1)
    expect(peak(out, 1.2, 2)).toBeLessThan(0.01)
  })

  it('leaves unheard a note at or past the pattern length, and one before its from', async () => {
    // Length 1s: the note at 1.5s is kept and not played.
    const past = await render(project([device('a')], [track('a', [note(second / 4), note(1.5 * second)], second)]), 2)
    expect(peak(past, 0.25, 0.35)).toBeGreaterThan(0.1)
    expect(peak(past, 1.4, 2)).toBeLessThan(0.01)
    // From 0.5s: the note at 0.25s is not played, the one at 0.75s sounds 0.25s into the clip.
    const p = project([device('a')], [{ ...track('a', [note(second / 4), note(0.75 * second)], 2 * second), patterns: { a: { length: second, from: second / 2, notes: [note(second / 4), note(0.75 * second)] } } }])
    const from = await render(p, 2)
    expect(onset(from)).toBeCloseTo(0.25, 2)
    expect(peak(from, 0.4, 2)).toBeLessThan(0.01)
  })

  it('plays two tracks targeting one device through its one instrument', async () => {
    const p = project(stereo(), [track('one', [note(0)], 2 * second, 0), track('two', [note(second)], 2 * second, 0)])
    const out = await render(p, 2)
    expect(peak(out, 0, 0.1, 0)).toBeGreaterThan(0.1)
    expect(peak(out, 1, 1.1, 0)).toBeGreaterThan(0.1)
    expect(peak(out, 0, 2, 1)).toBeLessThan(0.001)
  })

  it("shares one synth's voices among the tracks targeting it, a note past the last voice taking the first", async () => {
    const poly = (voices: number): Instrument => ({ is: 'Synth', voices, options: { volume: -12, oscillator: { type: 'square' }, envelope: { attack: 0.001, decay: 0, sustain: 1, release: 0.001 } } })
    const two = (i: Instrument) => project([device('pad', 0, i)], [track('one', [note(0, second)], 2 * second), track('two', [note(0, second)], 2 * second)])
    const one = await render(project([device('pad', 0, poly(6))], [track('one', [note(0, second)], 2 * second)]), 1)
    const both = await render(two(poly(6)), 1)
    const capped = await render(two(poly(1)), 1)
    const single = peak(one, 0, 0.5)
    expect(single).toBeGreaterThan(0.05)
    expect(peak(both, 0, 0.5)).toBeCloseTo(2 * single, 1)
    expect(peak(capped, 0, 0.5)).toBeCloseTo(single, 1)
  })

  it('plays nothing for a track that targets no device', async () => {
    const out = await render(project(stereo(), [track('none', [note(0, second)], second, null)]), 1)
    expect(peak(out, 0, 1, 0)).toBe(0)
    expect(peak(out, 0, 1, 1)).toBe(0)
  })

  it('holds back a muted track notes, and every track but the soloed one', async () => {
    const both = project(stereo(), [track('l', [note(0, second)], second, 0), track('r', [note(0, second)], second, 1)])
    const plain = await render(both, 1)
    expect(peak(plain, 0, 1, 0)).toBeGreaterThan(0.1)
    expect(peak(plain, 0, 1, 1)).toBeGreaterThan(0.1)
    const muted = await render(setTrack(both, 0, 'mute', true), 1)
    expect(peak(muted, 0, 1, 0)).toBeLessThan(0.001)
    expect(peak(muted, 0, 1, 1)).toBeGreaterThan(0.1)
    const soloed = await render(setTrack(both, 1, 'solo', true), 1)
    expect(peak(soloed, 0, 1, 0)).toBeLessThan(0.001)
    expect(peak(soloed, 0, 1, 1)).toBeGreaterThan(0.1)
  })

  it('holds back a track muted or another soloed mid-song from its next note', async () => {
    const both = project(stereo(), [track('l', [note(0), note(second)], 2 * second, 0), track('r', [note(0), note(second)], 2 * second, 1)])
    const muted = await render(both, 2, at(0.5, () => setTrack(both, 0, 'mute', true)))
    expect(peak(muted, 0, 0.1, 0)).toBeGreaterThan(0.1)
    expect(peak(muted, 0.9, 1.2, 0)).toBeLessThan(0.001)
    expect(peak(muted, 1, 1.1, 1)).toBeGreaterThan(0.1)
    const soloed = await render(both, 2, at(0.5, () => setTrack(both, 0, 'solo', true)))
    expect(peak(soloed, 0, 0.1, 1)).toBeGreaterThan(0.1)
    expect(peak(soloed, 1, 1.1, 0)).toBeGreaterThan(0.1)
    expect(peak(soloed, 0.9, 1.2, 1)).toBeLessThan(0.001)
  })

  it('sends a track retargeted mid-song to its new device from its next note', async () => {
    const p = project(stereo(), [track('t', [note(0), note(second)], 2 * second, 0)])
    const out = await render(p, 2, at(0.5, () => setTarget(p, 0, 1)))
    expect(peak(out, 0, 0.1, 0)).toBeGreaterThan(0.1)
    expect(peak(out, 0, 0.1, 1)).toBeLessThan(0.001)
    expect(peak(out, 0.9, 1.2, 0)).toBeLessThan(0.001)
    expect(peak(out, 1, 1.1, 1)).toBeGreaterThan(0.1)
    const none = await render(p, 2, at(0.5, () => setTarget(p, 0, undefined)))
    expect(peak(none, 0.5, 2, 0)).toBeLessThan(0.001)
  })

  it('silences a device through its channel mute, and every device but the soloed one', async () => {
    const both = project(stereo(), [track('l', [note(0, second)], second, 0), track('r', [note(0, second)], second, 1)])
    const muted = await render(setChannel(both, 0, 'mute', true), 1)
    expect(peak(muted, 0, 1, 0)).toBeLessThan(0.001)
    expect(peak(muted, 0, 1, 1)).toBeGreaterThan(0.1)
    const soloed = await render(setChannel(both, 1, 'solo', true), 1)
    expect(peak(soloed, 0, 1, 0)).toBeLessThan(0.001)
    expect(peak(soloed, 0, 1, 1)).toBeGreaterThan(0.1)
    const later = await render(both, 1, at(0.5, () => setChannel(both, 0, 'mute', true)))
    expect(peak(later, 0, 0.4, 0)).toBeGreaterThan(0.1)
    expect(peak(later, 0.6, 1, 0)).toBeLessThan(0.001)
  })

  it('plays an edit to a pattern notes while it plays', async () => {
    const start = project([device('a')], [track('a', [note(0)], 2 * second)])
    const out = await render(start, 2, at(0.5, () => addNote(start, 0, 'a', note(second))))
    expect(peak(out, 0.2, 0.95)).toBeLessThan(0.01)
    expect(peak(out, 1, 1.1)).toBeGreaterThan(0.1)
  })

  it('makes the Part again when a pattern length or from is edited', async () => {
    const start = project([device('a')], [track('a', [note(0), note(second)], second / 2)])
    const plain = await render(start, 2)
    expect(peak(plain, 0.9, 2)).toBeLessThan(0.01)
    // Before the song's end, which is the half-second clip's end until the edit moves it.
    const longer = await render(start, 2, at(0.25, () => setLength(start, 0, 'a', 2 * second)))
    expect(peak(longer, 1, 1.1)).toBeGreaterThan(0.1)
  })

  it('plays a pattern whose from was set, its played notes where they were in the song', async () => {
    const long = setFrom(project([device('a')], [track('a', [note(0), note(second)], 2 * second)]), 0, 'a', second / 2)
    const out = await render(long, 2)
    expect(peak(out, 0, 0.9)).toBeLessThan(0.01)
    expect(peak(out, 1, 1.1)).toBeGreaterThan(0.1)
  })

  it('takes tracks added and removed mid-song without a reload', async () => {
    const p = project(stereo(), [track('l', [note(second)], 2 * second, 0), track('r', [note(second, 48, 'E5')], 2 * second, 1)])
    const added = await render(p, 2, at(0.5, () => addClip(addTrack(p, track('new', [note(1.5 * second)], 2 * second, 0)), { track: 2, pattern: 'a', start: 0 })))
    expect(peak(added, 1, 1.1, 0)).toBeGreaterThan(0.1)
    expect(peak(added, 1.5, 1.6, 0)).toBeGreaterThan(0.1)
    expect(peak(added, 1, 1.1, 1)).toBeGreaterThan(0.1)
    const removed = await render(p, 2, at(0.5, () => removeTrack(p, 0)))
    expect(peak(removed, 0.9, 2, 0)).toBeLessThan(0.001)
    expect(peak(removed, 1, 1.1, 1)).toBeGreaterThan(0.1)
  })

  it('makes the rack again when a device is added or removed by an edit', async () => {
    const p = project(stereo(), [track('r', [note(second)], 2 * second, 1)])
    // Device 0 goes: the track follows the right device down to 0.
    const removed = await render(p, 2, (s) => s.edit(removeDevice(p, 0)))
    expect(peak(removed, 1, 1.1, 1)).toBeGreaterThan(0.1)
    expect(peak(removed, 0.9, 1.2, 0)).toBeLessThan(0.001)
    // A device added and targeted plays.
    const one = project([device('left', -1)], [track('t', [note(second)], 2 * second, 0)])
    const added = await render(one, 2, (s) => s.edit(setTarget(addDevice(one, device('right', 1)), 0, 1)))
    expect(peak(added, 1, 1.1, 1)).toBeGreaterThan(0.1)
    expect(peak(added, 0.9, 1.2, 0)).toBeLessThan(0.001)
  })

  it('stops itself at the span end, and where an edit moves the end', async () => {
    const p = project([device('a')], [track('a', [note(0), note(1.5 * second)], 2 * second)])
    const cut = await render({ ...p, span: { start: 0, end: second } }, 2)
    expect(peak(cut, 0, 0.1)).toBeGreaterThan(0.1)
    expect(peak(cut, 1, 2)).toBeLessThan(0.01)
    const moved = await render({ ...p, span: { start: 0, end: second } }, 2, at(0.5, () => ({ ...p, span: { start: 0, end: 2 * second } })))
    expect(peak(moved, 1.5, 1.6)).toBeGreaterThan(0.1)
  })

  it('lets go of every held note on every instrument when the transport stops or pauses', async () => {
    const env = { attack: 0.001, decay: 0, sustain: 1, release: 0.01 }
    const kinds: Instrument[] = [
      synth,
      { is: 'Synth', voices: 6, options: { oscillator: { type: 'square' }, envelope: env } },
      { is: 'NoiseSynth', options: { envelope: env } },
      { is: DRUM_KIT, options: { pads: { A4: { name: 'hat', is: 'NoiseSynth', options: { envelope: env } } } } },
    ]
    for (const i of kinds) {
      // A note four seconds long, from the start.
      const p = project([device('a', 0, i)], [track('a', [note(0, 4 * second)], 4 * second)])
      const held = await render(p, 2)
      expect(peak(held, 1, 2)).toBeGreaterThan(0.05)
      for (const how of ['stop', 'pause'] as const) {
        const cut = await render(p, 2, halt(how, 0.5))
        expect(peak(cut, 0, 0.4)).toBeGreaterThan(0.05)
        expect(peak(cut, 0.6, 2), `${i.is} ${how}`).toBeLessThan(0.001)
      }
    }
    // Two notes on one synth's voices, the second begun just before the stop.
    const poly = kinds[1]!
    const chords = project([device('a', 0, poly)], [track('a', [note(0, 4 * second), note(0.49 * second, 4 * second, 'E5')], 4 * second)])
    const cut = await render(chords, 2, halt('stop', 0.5))
    expect(peak(cut, 0.7, 2)).toBeLessThan(0.001)
  })

  it('plays a drum kit by note, with choke groups, and nothing for a note no pad has', async () => {
    const kit = (choke?: string): Instrument => ({
      is: 'DrumKit',
      options: {
        pads: {
          C1: { name: 'kick', is: 'MembraneSynth', pitch: 'C1', options: { envelope: { attack: 0.001, decay: 0.05, sustain: 0, release: 0.01 } } },
          'F#1': { name: 'closed', is: 'NoiseSynth', ...(choke ? { choke } : {}), options: { envelope: { attack: 0.001, decay: 0.05, sustain: 0, release: 0.01 } } },
          'A#1': { name: 'open', is: 'NoiseSynth', ...(choke ? { choke } : {}), options: { envelope: { attack: 0.001, decay: 0, sustain: 1, release: 0.01 } } },
        },
      },
    })
    const hits = [note(0, 48, 'C1'), note(0.5 * second, 48, 'F#1'), note(second, 48, 'E1'), note(1.5 * second, 2 * second, 'A#1'), note(2 * second, 24, 'F#1')]
    const p = (i: Instrument) => project([device('kit', 0, i)], [track('drums', hits, 4 * second)])
    const out = await render(p(kit('hat')), 3)
    expect(peak(out, 0, 0.1)).toBeGreaterThan(0.1)
    expect(peak(out, 0.5, 0.55)).toBeGreaterThan(0.05)
    expect(peak(out, 0.9, 1.4)).toBeLessThan(0.01)
    expect(peak(out, 1.5, 1.9)).toBeGreaterThan(0.05)
    // The closed hat at 2s cuts the open one.
    expect(peak(out, 2.3, 3)).toBeLessThan(0.01)
    const open = await render(p(kit()), 3)
    expect(peak(open, 2.3, 3)).toBeGreaterThan(0.05)
  })

  it('plays a NoiseSynth device, which has no pitch', async () => {
    const noise: Instrument = { is: 'NoiseSynth', options: { envelope: { attack: 0.001, decay: 0, sustain: 1, release: 0.01 } } }
    const out = await render(project([device('n', 0, noise)], [track('n', [note(second / 2, second / 4)], second)]), 1)
    expect(onset(out)).toBeCloseTo(0.5, 2)
    expect(peak(out, 0.9, 1)).toBeLessThan(0.01)
  })

  it('turns a device effect off as wet 0, and on again mid-song', async () => {
    // A delay all wet sounds the note 0.5s late; off, the note is dry.
    const echo = { is: 'FeedbackDelay', on: true, options: { delayTime: 0.5, feedback: 0, wet: 1 } }
    const p = addEffect(project([device('a')], [track('a', [note(0), note(second)], 2 * second)]), { device: 0 }, echo)
    const on = await render(p, 2)
    expect(peak(on, 0, 0.4)).toBeLessThan(0.01)
    expect(peak(on, 0.5, 0.6)).toBeGreaterThan(0.1)
    const off = turnEffect(p, { device: 0 }, 0, false)
    const dry = await render(off, 2)
    expect(peak(dry, 0, 0.1)).toBeGreaterThan(0.1)
    expect(peak(dry, 0.3, 0.9)).toBeLessThan(0.01)
    const back = await render(off, 2, at(0.6, () => p))
    expect(peak(back, 0, 0.1)).toBeGreaterThan(0.1)
    expect(peak(back, 0.95, 1.4)).toBeLessThan(0.01)
    expect(peak(back, 1.5, 1.6)).toBeGreaterThan(0.1)
  })

  it('runs the LFO of an effect Tone makes stopped: a Tremolo swells', async () => {
    // A held note through a Tremolo of 4 Hz at full depth swells and dies four times a second: the
    // loudest of each twentieth of a second rises and falls, where a stopped LFO holds it level. Its
    // `spread` is 0, both sides in step: a device's channel sums the two sides into one, and at
    // Tone's 180 the sides' swells, opposite, sum level.
    const tremolo = { is: 'Tremolo', on: true, options: { frequency: 4, depth: 1, spread: 0, wet: 1 } }
    const out = await render(addEffect(project([device('a')], [track('a', [note(0, 2 * second)], 2 * second)]), { device: 0 }, tremolo), 1)
    const windows = Array.from({ length: 16 }, (_, i) => peak(out, 0.2 + i * 0.05, 0.25 + i * 0.05))
    expect(Math.max(...windows)).toBeGreaterThan(0.3)
    expect(Math.min(...windows)).toBeLessThan(Math.max(...windows) / 4)
  })

  it('reaches a bus through a device send, and the bus effects', async () => {
    const dry = { ...project([device('left', -1)], [track('l', [note(0, second)], second)]), buses: { verb: { volume: 0, pan: 1, effects: [] } } }
    const without = await render(dry, 1)
    expect(peak(without, 0, 1, 1)).toBeLessThan(0.001)
    const sent = await render(setSend(dry, 0, 'verb', 0), 1)
    expect(peak(sent, 0, 1, 1)).toBeGreaterThan(0.1)
    const plain = project([device('left', -1)], [track('l', [note(0, second)], second)])
    const busAdded = await render(plain, 1, (s) => s.edit(setSend(addBus(plain, 'verb', { volume: 0, pan: 1, effects: [] }), 0, 'verb', 0)))
    expect(peak(busAdded, 0, 1, 1)).toBeGreaterThan(0.1)
    const short = { ...dry, tracks: [track('l', [note(0)], second)] }
    const echoShort = await render(addEffect(setSend(short, 0, 'verb', 0), { bus: 'verb' }, { is: 'FeedbackDelay', on: true, options: { delayTime: 0.5, feedback: 0, wet: 1 } }), 2)
    expect(peak(echoShort, 0, 0.4, 1)).toBeLessThan(0.01)
    expect(peak(echoShort, 0.5, 0.6, 1)).toBeGreaterThan(0.1)
  })

  it('sets the master volume and plays through the master effects', async () => {
    const p = project([device('a')], [track('a', [note(0)], second)])
    const quiet = await render({ ...p, master: { volume: -200, effects: [] } }, 1)
    expect(peak(quiet, 0, 1)).toBeLessThan(0.001)
    const echo = await render(addEffect(p, 'master', { is: 'FeedbackDelay', on: true, options: { delayTime: 0.5, feedback: 0, wet: 1 } }), 1)
    expect(peak(echo, 0, 0.4)).toBeLessThan(0.01)
    expect(peak(echo, 0.5, 0.6)).toBeGreaterThan(0.1)
  })

  it('cycles between the loop points', async () => {
    const p = { ...project([device('a')], [track('a', [note(second / 2), note(second * 2)], 3 * second)]), loop: { start: 0, end: second } }
    const out = await render(p, 3, () => { Tone.getTransport().loop = true })
    for (const t of [0.5, 1.5, 2.5]) expect(peak(out, t, t + 0.1)).toBeGreaterThan(0.1)
    expect(peak(out, 2, 2.1)).toBeLessThan(0.01)
  })

  it('plays and lets go a key on a device by its index', async () => {
    const p = project(stereo(), [])
    const out = await render(p, 1, (s) => s.attack(1, 'A4', 1))
    expect(peak(out, 0, 1, 1)).toBeGreaterThan(0.1)
    expect(peak(out, 0, 1, 0)).toBeLessThan(0.001)
    const noise = await render(project([device('n', 0, { is: 'NoiseSynth', options: { envelope: { attack: 0.001, decay: 0, sustain: 1, release: 0.01 } } })], []), 1, (s) => s.attack(0, 'C4', 1))
    expect(peak(noise, 0, 1)).toBeGreaterThan(0.05)
    const let_go = await render(p, 1, (s) => { s.attack(1, 'A4', 1); s.release(1, 'A4') })
    expect(peak(let_go, 0.2, 1, 1)).toBeLessThan(0.001)
  })

  it('reads the sound on a meter, and on a device added or taken away by an edit', async () => {
    await live(async () => {
      const daw = audiodaw()
      const start = { ...project([device('a')], [track('a', [note(0, 8 * second)], 8 * second)]), buses: { verb: { volume: 0, pan: 0, effects: [] } } }
      daw.load(start)
      const meters = [daw.meter(0), daw.meter('verb'), daw.meter('master')]
      expect(meters.map((m) => m.getValue())).toEqual([-Infinity, -Infinity, -Infinity])
      await daw.start()
      daw.play(0)
      expect(daw.playing).toBe(true)
      await wait(400)
      expect(meters[0]!.getValue()).toBeGreaterThan(-20)
      expect(meters[1]!.getValue()).toBe(-Infinity)
      expect(meters[2]!.getValue()).toBeGreaterThan(-20)
      expect(daw.position()).toBeGreaterThan(0)
      // A device added: the rack is made again, and its meters read the strips there are now.
      daw.edit(setTarget(addDevice(start, device('b')), 0, 1))
      expect(daw.meter(1)).toBeInstanceOf(Tone.Meter)
      // Device 0 taken away: one device is left.
      daw.edit(removeDevice(setTarget(addDevice(start, device('b')), 0, 1), 0))
      expect(daw.meter(0)).toBeInstanceOf(Tone.Meter)
      daw.stop()
      expect(daw.playing).toBe(false)
      daw.dispose()
    })
  })

  it('lets go of a drum kit when another song is loaded and when disposed', async () => {
    await live(async () => {
      const kit: Instrument = { is: DRUM_KIT, options: { volume: 0, pads: { C1: { is: 'MembraneSynth', options: {} }, D1: { is: 'NoiseSynth', options: {} } } } }
      const daw = audiodaw()
      daw.load(project([device('drums', 0, kit)], [track('beat', [note(0, 48, 'C1')], second)]))
      daw.load(project([device('drums', 0, kit)], [track('beat', [note(0, 48, 'D1')], second)]))
      expect(daw.meter(0)).toBeInstanceOf(Tone.Meter)
      expect(() => daw.dispose()).not.toThrow()
    })
  })

  it("hands out Tone's options of an instrument, a kit's pads and an effect, as they are after an edit", async () => {
    await live(async () => {
      const daw = audiodaw()
      const mono: Instrument = { is: 'MonoSynth', options: { oscillator: { type: 'sawtooth' }, filter: { Q: 4 } } }
      const kit: Instrument = { is: DRUM_KIT, options: { volume: -3, pads: { C1: { name: 'KICK', is: 'MembraneSynth', options: { octaves: 4 } } } } }
      const withEcho = { ...device('lead', 0, mono), effects: [{ is: 'FeedbackDelay', on: true, options: { feedback: 0.3 } }] }
      const start = project([withEcho, device('drums', 0, kit)], [track('a', [note(0)], second)])
      daw.load(start)
      const lead = daw.optionsOf(0) as { oscillator: Record<string, unknown>; filter: { Q: number; type: string }; envelope: { attackCurve: string } }
      expect(lead.oscillator.type).toBe('sawtooth')
      expect(lead.filter).toMatchObject({ Q: 4, type: 'lowpass' })
      expect(lead.envelope.attackCurve).toBe('linear')
      expect(lead.oscillator).not.toHaveProperty('spread')
      // A fat oscillator brings Tone's count and spread with it.
      daw.edit({ ...start, rack: [{ ...withEcho, instrument: { ...mono, options: { ...mono.options, oscillator: { type: 'fatsawtooth' } } } }, start.rack[1]!] })
      expect((daw.optionsOf(0) as { oscillator: object }).oscillator).toMatchObject({ type: 'fatsawtooth', count: 3, spread: 20 })
      const drums = daw.optionsOf(1) as { volume: number; pads: Record<string, { name: string; options: { octaves: number; pitchDecay: number } }> }
      expect(drums.volume).toBe(-3)
      expect(drums.pads.C1!.name).toBe('KICK')
      expect(drums.pads.C1!.options.octaves).toBe(4)
      expect(drums.pads.C1!.options.pitchDecay).toBe(0.05)
      expect(daw.effectOptionsOf({ device: 0 }, 0)).toMatchObject({ feedback: 0.3, wet: 1 })
      daw.dispose()
    })
  })

  it('makes an effect again for an option Tone takes only when it is made', async () => {
    await live(async () => {
      const daw = audiodaw()
      const phased = (options: object, on = true): Device => ({ ...device('a'), effects: [{ is: 'Phaser', on, options }] })
      const start = project([phased({ stages: 4 })], [track('a', [note(0)], second)])
      daw.load(start)
      expect(daw.effectOptionsOf({ device: 0 }, 0)).toMatchObject({ stages: 4 })
      daw.edit({ ...start, rack: [phased({ stages: 12 })] })
      expect(daw.effectOptionsOf({ device: 0 }, 0)).toMatchObject({ stages: 12 })
      daw.edit({ ...start, rack: [phased({ stages: 12, Q: 3 })] })
      expect(daw.effectOptionsOf({ device: 0 }, 0)).toMatchObject({ stages: 12, Q: 3 })
      // Off, Tone's wet is 0; the wet read is the song's, to come back to when it is turned on.
      daw.edit({ ...start, rack: [phased({ stages: 12, Q: 3, wet: 0.4 }, false)] })
      expect(daw.effectOptionsOf({ device: 0 }, 0)).toMatchObject({ wet: 0.4, Q: 3, stages: 12 })
      daw.dispose()
    })
  })

  it("sounds the song's first note when play is pressed on a song loaded while the page's audio was suspended", async () => {
    await live(async () => {
      // A page's audio is suspended until a press: the song loads then, and the press resumes it and
      // plays, at once, as the studio's PLAY does.
      await (Tone.getContext().rawContext as unknown as AudioContext).suspend()
      const daw = audiodaw()
      const p = project([device('a')], [track('a', [note(0, second / 4)], 8 * second)])
      daw.load(p)
      const meter = daw.meter(0)
      void daw.start()
      daw.play(0)
      // The note is a quarter of a second from the song's start: the meter is read every 5ms through it.
      let most = -Infinity
      for (let k = 0; k < 80; k++) {
        await wait(5)
        most = Math.max(most, meter.getValue() as number)
      }
      expect(most).toBeGreaterThan(-20)
      daw.dispose()
    })
  })

  it('stops the transport at the span end, and at the end an edit moves', async () => {
    await live(async () => {
      const daw = audiodaw()
      const p = project([device('a')], [track('a', [note(0)], 8 * second)])
      daw.load({ ...p, span: { start: 0, end: second / 4 } })
      await daw.start()
      daw.play(0)
      await wait(600)
      expect(daw.playing).toBe(false)
      daw.edit({ ...p, span: { start: 0, end: 4 * second } })
      daw.play(0)
      await wait(600)
      expect(daw.playing).toBe(true)
      daw.dispose()
    })
  })
})

describe('audiodaw timing', () => {
  it("makes the song again, as last edited, on a new context of other timing, and closes the old one", async () => {
    const was = Tone.getContext()
    const daw = audiodaw()
    try {
      daw.tick({ wire: { scene: { world: { audiodaw: { lookAhead: 0.1, latencyHint: 0.05 } } } } } as unknown as Plugins)
      const first = Tone.getContext()
      expect(daw.timing).toMatchObject({ lookAhead: 0.1, latencyHint: 0.05 })
      const p = project([device('a')], [track('a', [note(0)], second)])
      daw.load(p)
      // An edit after the load: the song made again is the edited one.
      const slow: Instrument = { ...synth, options: { ...synth.options, envelope: { attack: 0.5, decay: 0, sustain: 1, release: 0.001 } } }
      daw.edit({ ...p, rack: [{ ...p.rack[0]!, instrument: slow }] })
      daw.play(0)
      const closing = daw.retime({ lookAhead: 0.3, latencyHint: 0.2 })
      expect(daw.playing).toBe(false)
      expect(Tone.getContext()).not.toBe(first)
      expect(daw.timing).toMatchObject({ lookAhead: 0.3, latencyHint: 0.2 })
      // The buffer is what the browser reports for the new context, whatever it rounded the hint to.
      const raw = Tone.getContext().rawContext as unknown as AudioContext
      expect(daw.timing.buffer).toBe(raw.baseLatency + raw.outputLatency)
      expect((daw.optionsOf(0) as { envelope: { attack: number } }).envelope.attack).toBe(0.5)
      await closing
      expect((first.rawContext as unknown as AudioContext).state).toBe('closed')
      // A tick after it leaves the new timing in place.
      daw.tick({ wire: { scene: { world: { audiodaw: { lookAhead: 0.1, latencyHint: 0.05 } } } } } as unknown as Plugins)
      expect(daw.timing.lookAhead).toBe(0.3)
      daw.dispose()
    } finally {
      await (Tone.getContext() as Tone.Context).close()
      Tone.setContext(was)
    }
  })
})
