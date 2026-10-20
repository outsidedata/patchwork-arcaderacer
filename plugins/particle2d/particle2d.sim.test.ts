// The ledger of the effects the rules spawn. The test writes its own scene: the ledger row and a
// `gun` kind whose tick emits on the step its row says to, and moves or stops what it emitted.
import { expect, test } from 'vitest'
import { boot, type Scene, type Sim } from '#engine/engine.ts'
import { emit, entry, particle2d, type Entry } from './particle2d.sim.ts'

const DT = 1 / 60
const HOLD = 0.1

const gun: Sim[string] = {
  tick(me, _dt, w) {
    const d = me.data
    if (d.at === d.step) {
      d.id = emit(w, d.effect, d.from, d.spawn).id
      if (d.shift) d.from[0] = 99
    }
    d.step++
    const mine = entry(w, d.id)
    if (mine && d.moveTo) mine.at = d.moveTo
    if (mine && d.stop) mine.life = mine.age
  },
}

const scene = (guns: Record<string, unknown>[], ledger = true): Scene => ({
  world: { seed: 1, particle2d: { effects: 'effects', hold: HOLD } },
  prefabs: {
    particle2d: { next: 1, live: [] },
    gun: { step: 0, at: 0, effect: 'puff', from: [1, 2], spawn: {}, id: 0, shift: false, moveTo: null, stop: false },
  },
  actors: [...(ledger ? [{ is: 'particle2d' }] : []), ...guns.map(g => ({ is: 'gun', ...g }))],
})

const sim: Sim = { particle2d, gun }
const live = (truth: ReturnType<typeof boot>): Entry[] => truth.rows.find(r => r.kind === 'particle2d')!.data.live

test('an emit is an entry on the ledger row, at age 0 in the packet of its step, one dt older each step after', () => {
  const truth = boot(scene([{ spawn: { life: 0.5, dir: [0, -1], tint: 0xff0000, scale: 2, floor: -1, layer: 'air' } }]), sim)
  truth.step(DT)
  expect(live(truth)).toEqual([{ id: 1, effect: 'puff', at: [1, 2], age: 0, life: 0.5, dir: [0, -1], tint: 0xff0000, scale: 2, floor: -1, layer: 'air' }])
  truth.step(DT)
  expect(live(truth)[0].age).toBeCloseTo(DT, 12)
})

test('an entry leaves the row once its life is over, and one burst stays for hold', () => {
  const truth = boot(scene([{ spawn: { life: 0.5 } }, { effect: 'spark', spawn: {} }]), sim)
  const last: Record<string, number> = {}
  for (let n = 1; n < 60; n++) {
    truth.step(DT)
    for (const e of live(truth)) last[e.effect] = e.age
  }
  // The last age each was sent at is under its life, or under hold for a single burst, and one
  // more step would have reached it.
  expect(last.puff).toBeLessThan(0.5)
  expect(last.puff + DT).toBeGreaterThanOrEqual(0.5)
  expect(last.spark).toBeLessThan(HOLD)
  expect(last.spark + DT).toBeGreaterThanOrEqual(HOLD)
})

test('entries take the next id; the point is the rule\'s at the moment of the emit; a spawn field left out is not on the entry', () => {
  const truth = boot(scene([{ shift: true }, { at: 2 }]), sim)
  truth.step(DT)
  truth.step(DT)
  truth.step(DT)
  expect(live(truth).map(e => e.id)).toEqual([1, 2])
  // The first gun moved its own point to x 99 after emitting; its entry kept the one it was given.
  expect(truth.rows.find(r => r.kind === 'gun')!.data.from).toEqual([99, 2])
  expect(live(truth).map(e => e.at)).toEqual([[1, 2], [1, 2]])
  expect(Object.keys(live(truth)[0]).sort()).toEqual(['age', 'at', 'effect', 'id', 'life'])
})

test('a rule finds the entry it holds by its id, moves it by writing its at, and stops it by writing its life', () => {
  const truth = boot(scene([{ spawn: { life: 5 }, moveTo: [7, 7] }]), sim)
  truth.step(DT)
  truth.step(DT)
  expect(live(truth)[0].at).toEqual([7, 7])
  const stopped = boot(scene([{ spawn: { life: 5 }, stop: true }]), sim)
  for (let n = 0; n < Math.ceil(HOLD / DT) + 2; n++) stopped.step(DT)
  expect(live(stopped)).toEqual([])
})

test('an emit in a scene with no ledger row throws', () => {
  const truth = boot(scene([{}], false), sim)
  expect(() => truth.step(DT)).toThrow('particle2d needs one ledger row, and the scene has 0')
})

test('an entry from a row stays on the ledger past its life and hold for as long as the row is there, and leaves in the first before after the row has gone', () => {
  // the gun is row 2, after the ledger
  const truth = boot(scene([{ spawn: { from: 2 } }]), sim)
  for (let n = 0; n < 120; n++) truth.step(DT)
  expect(live(truth)).toHaveLength(1)
  expect(live(truth)[0]).toMatchObject({ from: 2, life: 0 })
  truth.end(truth.rows.find(r => r.kind === 'gun')!)
  truth.step(DT)
  expect(live(truth)).toEqual([])
  // gone in less than hold: its life was its age
  const soon = boot(scene([{ spawn: { from: 2 } }]), sim)
  soon.step(DT)
  soon.end(soon.rows.find(r => r.kind === 'gun')!)
  soon.step(DT)
  expect(live(soon)).toMatchObject([{ life: DT, age: DT }])
  expect(live(soon)[0]).not.toHaveProperty('from')
})

test('with fly, an entry\'s life is the seconds its point takes to reach its to, and what it lands is on it', () => {
  const land = [{ effect: 'crater', seed: 4 }, { effect: 'smoke', tint: 0x808080 }]
  const truth = boot(scene([{ spawn: { to: [4, 6], fly: 5, land } }]), sim)
  truth.step(DT)
  expect(live(truth)).toEqual([{ id: 1, effect: 'puff', at: [1, 2], age: 0, life: 1, to: [4, 6], fly: 5, land }])
  expect(() => boot(scene([{ spawn: { fly: 5 } }]), sim).step(DT)).toThrow('particle2d effect puff flies and was spawned with no to')
})

test('a field of the ledger row particle2d does not know throws, naming it', () => {
  const s = scene([])
  s.prefabs.particle2d = { ...s.prefabs.particle2d as object, efects: 'effects' }
  expect(() => boot(s, sim).step(DT)).toThrow('the particle2d prefab has efects, which particle2d does not know')
})
