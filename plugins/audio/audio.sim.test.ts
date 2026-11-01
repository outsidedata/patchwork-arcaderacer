// The ledger of the sounds the rules raise. The test writes its own scene: the ledger row, and a
// `bell` kind that raises a sound in its tick on the steps its row lists, in the way its row says
// (at a point, from itself, from a row that then ends, or through the ledger's act), and that asks
// `chance` each step and keeps the answers.
import { expect, test } from 'vitest'
import { boot, type Row, type Scene, type Sim, type Truth } from '#engine/engine.ts'
import { audio, chance, sound, type Entry } from './audio.sim.ts'

const DT = 1 / 60
const HOLD = 0.25

const bell: Sim[string] = {
  before(me, _dt, w) {
    if (me.data.early) sound(w, 'early', [0, 0, 0])
  },
  tick(me, _dt, w) {
    const d = me.data
    d.step++
    if (d.odds) d.heard.push(chance(w, me.id, d.odds))
    if (!d.on.includes(d.step)) return
    for (let i = 0; i < d.times; i++) {
      if (d.how === 'at') sound(w, d.cue, [1, 2, 3])
      if (d.how === 'from') sound(w, d.cue, undefined, me.id)
      if (d.how === 'both') sound(w, d.cue, [7, 8, 9], me.id)
      if (d.how === 'bare') sound(w, d.cue)
      if (d.how === 'mine') sound(w, d.cue, d.pos)
      if (d.how === 'act') w.call(w.find('audio'), 'play', -1, d.cue, 4, 5, 6, null)
      if (d.how === 'actFrom') w.call(w.find('audio'), 'play', -1, d.cue, null, null, null, me.id)
      if (d.how === 'timed') sound(w, d.cue, undefined, me.id, i * 0.005)
    }
    if (d.move) d.pos[0] += 1
    if (d.end) w.end(me)
  },
}

const scene = (bells: Record<string, unknown>[], order: 'ledger first' | 'ledger last' | 'no ledger' = 'ledger first'): Scene => {
  const ledger = order === 'no ledger' ? [] : [{ is: 'audio' }]
  const rest = bells.map(b => ({ is: 'bell', ...b }))
  return {
    world: { seed: 1, audio: { hold: HOLD } },
    prefabs: {
      audio: { step: 0, next: 1, live: [] },
      bell: { step: 0, on: [1], times: 1, how: 'at', cue: 'ding', pos: [10, 0, 20], move: false, end: false, early: false, odds: 0, heard: [] },
    },
    actors: order === 'ledger last' ? [...rest, ...ledger] : [...ledger, ...rest],
  }
}

const sim: Sim = { audio, bell }
const ledger = (t: Truth) => t.rows.find(r => r.kind === 'audio')!.data
const live = (t: Truth): Entry[] => ledger(t).live
const bellOf = (t: Truth, i = 0): Row => t.rows.filter(r => r.kind === 'bell')[i]

test('a sound raised with t carries the seconds into its step it happens; one raised without carries none', () => {
  const truth = boot(scene([{ how: 'timed', times: 3 }, { how: 'from' }]), sim)
  truth.step(DT)
  const [a, b] = [bellOf(truth, 0).id, bellOf(truth, 1).id]
  expect(live(truth)).toEqual([
    { id: 1, cue: 'ding', at: [10, 0, 20], from: a, step: 1, t: 0 },
    { id: 2, cue: 'ding', at: [10, 0, 20], from: a, step: 1, t: 0.005 },
    { id: 3, cue: 'ding', at: [10, 0, 20], from: a, step: 1, t: 0.01 },
    { id: 4, cue: 'ding', at: [10, 0, 20], from: b, step: 1 },
  ])
})

test('each sound is an entry with the next id and the ledger\'s step, so two in one step are two, and ids go on rising', () => {
  const truth = boot(scene([{ on: [1, 3], times: 2 }, { on: [3], cue: 'dong' }]), sim)
  truth.step(DT)
  expect(live(truth)).toEqual([
    { id: 1, cue: 'ding', at: [1, 2, 3], step: 1 },
    { id: 2, cue: 'ding', at: [1, 2, 3], step: 1 },
  ])
  truth.step(DT)
  truth.step(DT)
  expect(live(truth).map(e => [e.id, e.cue, e.step])).toEqual([[1, 'ding', 1], [2, 'ding', 1], [3, 'ding', 3], [4, 'ding', 3], [5, 'dong', 3]])
})

test('from a row, the entry keeps the row and the point it stood on as the sound was raised; a point given is kept as it was; with neither there is no point', () => {
  const truth = boot(scene([{ how: 'from', move: true }, { how: 'both' }, { how: 'bare' }, { how: 'mine', move: true }]), sim)
  truth.step(DT)
  const [from, both, bare, mine] = live(truth)
  expect(mine.at).toEqual([10, 0, 20])
  expect(bellOf(truth, 3).data.pos).toEqual([11, 0, 20])
  expect(from).toEqual({ id: 1, cue: 'ding', at: [10, 0, 20], from: bellOf(truth, 0).id, step: 1 })
  // The bell moved on after raising it; the entry kept where it was.
  expect(bellOf(truth, 0).data.pos).toEqual([11, 0, 20])
  expect(both).toEqual({ id: 2, cue: 'ding', at: [7, 8, 9], from: bellOf(truth, 1).id, step: 1 })
  expect(bare).toEqual({ id: 3, cue: 'ding', step: 1 })
})

test('an entry from a row that ends in the same step keeps where it was raised', () => {
  const truth = boot(scene([{ how: 'from', end: true }]), sim)
  truth.step(DT)
  expect(truth.rows.some(r => r.kind === 'bell')).toBe(false)
  expect(live(truth)[0].at).toEqual([10, 0, 20])
})

test('a sound from a player row rides that row\'s voiced, not the ledger, and leaves it after hold as a ledger entry does', () => {
  const file = scene([{ how: 'at', on: [1] }])
  file.prefabs.player = { ...file.prefabs.bell, how: 'from', on: [1, 2] }
  file.actors.push({ is: 'player' })
  const truth = boot(file, { ...sim, player: bell })
  const player = () => truth.rows.find(r => r.kind === 'player')!
  truth.step(DT)
  expect(live(truth).map(e => e.id)).toEqual([1])
  expect(player().data.voiced).toEqual([{ id: 2, cue: 'ding', at: [10, 0, 20], from: player().id, step: 1 }])
  truth.step(DT)
  expect((player().data.voiced as Entry[]).map(e => e.id)).toEqual([2, 3])
  const steps = Math.round(HOLD / DT)
  for (let n = 2; n < steps + 2; n++) truth.step(DT)
  expect(player().data.voiced).toEqual([])
  expect(live(truth)).toEqual([])
})

test('an entry is on the row for hold seconds of steps from the step it was raised on, then leaves', () => {
  const truth = boot(scene([{ on: [1, 2] }]), sim)
  const seen: number[][] = []
  for (let n = 0; n < 20; n++) {
    truth.step(DT)
    seen.push(live(truth).map(e => e.id))
  }
  const steps = Math.round(HOLD / DT)
  // Raised on steps 1 and 2, each is sent in the packets of `steps` steps: 1 to 15 and 2 to 16.
  expect(seen.map((ids, i) => ids.includes(1) ? i + 1 : 0).filter(Boolean)).toEqual(Array.from({ length: steps }, (_, i) => 1 + i))
  expect(seen.map((ids, i) => ids.includes(2) ? i + 1 : 0).filter(Boolean)).toEqual(Array.from({ length: steps }, (_, i) => 2 + i))
})

test('the act play adds an entry: three numbers for a point, or nulls, and a row id or null', () => {
  const truth = boot(scene([{ how: 'act' }, { how: 'actFrom', cue: 'dong' }]), sim)
  truth.step(DT)
  expect(live(truth)).toEqual([
    { id: 1, cue: 'ding', at: [4, 5, 6], step: 1 },
    { id: 2, cue: 'dong', at: [10, 0, 20], from: bellOf(truth, 1).id, step: 1 },
  ])
})

test('a sound raised in a before that runs ahead of the ledger\'s is stamped with the step before, and so leaves a step early', () => {
  for (const [order, stamp] of [['ledger first', 1], ['ledger last', 0]] as const) {
    const truth = boot(scene([{ early: true, on: [] }], order), sim)
    truth.step(DT)
    expect(live(truth)[0].step).toBe(stamp)
  }
})

test('chance is the same on two machines, turns on the row and the ledger\'s step, rolls no die, and comes up at its odds', () => {
  const odds = 3 / 256
  // A scene with no seed has a die that throws when rolled, so a run that ends rolled none.
  const run = () => {
    const truth = boot({ ...scene([{ odds, on: [] }, { odds, on: [] }]), world: {} }, sim)
    for (let n = 0; n < 20000; n++) truth.step(DT)
    return truth
  }
  const a = run(), b = run()
  const heard = (t: Truth, i: number): boolean[] => bellOf(t, i).data.heard
  expect(heard(a, 0)).toEqual(heard(b, 0))
  expect(heard(a, 0)).not.toEqual(heard(a, 1))
  for (const i of [0, 1]) {
    const yes = heard(a, i).filter(Boolean).length
    // 20000 asks at 3/256: 234 expected, and 3.5 standard deviations either way.
    expect(yes).toBeGreaterThan(180)
    expect(yes).toBeLessThan(290)
  }
})

test('a sound in a scene with no ledger row throws', () => {
  const truth = boot(scene([{}], 'no ledger'), sim)
  expect(() => truth.step(DT)).toThrow('audio needs one ledger row, and the scene has 0')
})
