// The vision addon: each seat is sent its team's own rows, the rows with no place, the `always`
// kinds, and every other row only while a seer of its team sees the cell it stands on.
//
// The tests boot a scene written here and attach vision to it themselves, each seat opened on the
// truth and given its slot by the test. The map is 20 × 10 cells of 10 world units. A `scout` sees 2
// cells, so from its cell it sees two along a line and one along a diagonal step; a `wall` sees
// nothing. Slot 0's scout stands in cell (1, 1) and slot 1's in (18, 1), with slot 1's wall at
// (15, 1). The crate `near` lies at (3, 1), two cells from slot 0's scout, and `edge` at (3, 2),
// just outside its sight; `far` at (10, 8) is seen by nobody. A `geyser`, the `always` kind, stands
// in the middle, and the `sky` has no place. Each scout's `tick` writes the crates its team sees,
// asked of `sees` as a rule asks it.
import { expect, test } from 'vitest'
import { boot, type Packet, type Row, type Scene, type Sim } from '#engine/engine.ts'
import { sees, vision } from './vision.addon.ts'

const DT = 1 / 60

const scene = (): Scene => ({
  world: { vision: { cell: 10, size: [20, 10], at: 'pos', slot: 'slot', sight: { scout: 2 }, always: ['geyser'] } },
  prefabs: {
    scout: { name: '', slot: 0, pos: [0, 0], spots: [] },
    wall: { name: '', slot: 0, pos: [0, 0] },
    crate: { name: '', pos: [0, 0] },
    geyser: { name: 'geyser', pos: [0, 0] },
    sky: { name: 'sky' },
  },
  actors: [
    { is: 'scout', name: 'scout0', slot: 0, pos: [15, 15] },
    { is: 'scout', name: 'scout1', slot: 1, pos: [185, 15] },
    { is: 'wall', name: 'wall1', slot: 1, pos: [155, 15] },
    { is: 'crate', name: 'near', pos: [35, 15] },
    { is: 'crate', name: 'edge', pos: [35, 25] },
    { is: 'crate', name: 'far', pos: [105, 85] },
    { is: 'geyser', pos: [100, 50] },
    { is: 'sky' },
  ],
})

const sim: Sim = {
  scout: { tick(me, _dt, w) { me.data.spots = w.all('crate').filter(c => sees(w.world, me.data.slot, c)).map(c => c.data.name).sort() } },
  wall: {},
  crate: {},
  geyser: {},
  sky: {},
}

// `slots` is each seat's slot, in the order the seats are opened; undefined opens a seat with none.
const start = (slots: (number | undefined)[] = [0, 1], file = scene()) => {
  const truth = boot(file, sim)
  const of = new Map<number, number | undefined>()
  vision(truth, seat => of.get(seat))
  const seats = slots.map(slot => {
    const seat = truth.open()
    of.set(seat, slot)
    return seat
  })
  const row = (name: string) => truth.rows.find(r => r.data.name === name)!
  // Moves a row to a world point and steps, so its team's sight is where it now stands.
  const move = (name: string, pos: number[]) => {
    row(name).data.pos = pos
    truth.step(DT)
  }
  // Each seat's packet, as names: the rows it is sent, and those born and ended since its last.
  const packets = () => seats.map(seat => {
    const p: Packet = truth.packet(seat)
    const named = (ids: number[]) => ids.map(id => truth.rows.find(r => r.id === id)!.data.name).sort()
    return { rows: p.rows.map(r => r.data.name).sort(), born: named(p.born), ended: named(p.ended) }
  })
  truth.step(DT)
  return { truth, seats, row, move, packets }
}

test('a seat is sent its own rows, the rows with no place, the always kinds and what its seers see', () => {
  const { truth, packets } = start([0, 1, undefined])
  const [a, b, none] = packets()
  expect(a.rows).toEqual(['geyser', 'near', 'scout0', 'sky'])
  expect(b.rows).toEqual(['geyser', 'scout1', 'sky', 'wall1'])
  // A seat with no slot has no team: it sees nothing on the map.
  expect(none.rows).toEqual(['geyser', 'sky'])
  // The truth's own rows are all there: only the packets leave rows out.
  expect(truth.rows.map(r => r.data.name).sort()).toEqual(['edge', 'far', 'geyser', 'near', 'scout0', 'scout1', 'sky', 'wall1'])
})

test('an enemy row is born into a seat\'s packet as it comes into sight, and ended as it leaves', () => {
  const { move, packets } = start()
  packets()
  // Into (4, 1): three cells from scout0, one past the sight of each, and in sight of both crates.
  move('scout1', [45, 15])
  expect(packets().map(p => [p.born, p.ended])).toEqual([[[], []], [['edge', 'near'], []]])
  // Into (3, 1): two cells apart, and each team sees the other's scout.
  move('scout1', [35, 15])
  const [a, b] = packets()
  expect([a.born, a.ended]).toEqual([['scout1'], []])
  expect([b.born, b.ended]).toEqual([['scout0'], []])
  // Back home: scout0 and the crates by it leave slot 1's sight, and scout1 leaves slot 0's.
  move('scout1', [185, 15])
  const [c, d] = packets()
  expect([c.born, c.ended]).toEqual([[], ['scout1']])
  expect([d.born, d.ended]).toEqual([[], ['edge', 'near', 'scout0']])
  // Its own wall was sent to it all along, out of its scout's sight or in it.
  expect(d.rows).toContain('wall1')
})

test('a row stands seen on the rim of a seer\'s sight and unseen one cell past it', () => {
  const { move, packets } = start()
  packets()
  // Up a cell to (1, 2): `edge` at (3, 2) is two cells along the line, and `near` at (3, 1) is a
  // diagonal step further, past two cells.
  move('scout0', [15, 25])
  expect(packets()[0]).toMatchObject({ born: ['edge'], ended: ['near'] })
})

test('slots the block\'s teams put on one team share their rows and their sight', () => {
  const file = scene()
  file.world!.vision.teams = ['red', 'blue', 'red']
  file.actors.push({ is: 'wall', name: 'wall2', slot: 2, pos: [55, 85] })
  const { packets } = start([0, 1, 2], file)
  const [a, b, c] = packets()
  // Slot 2 has no seer of its own: it sees what slot 0's scout sees, and slot 0 is sent its wall.
  expect(c.rows).toEqual(['geyser', 'near', 'scout0', 'sky', 'wall2'])
  expect(a.rows).toEqual(['geyser', 'near', 'scout0', 'sky', 'wall2'])
  expect(b.rows).toEqual(['geyser', 'scout1', 'sky', 'wall1'])
})

test('sees answers for a slot as its seat\'s packets do, in a rule and outside one, and is true on a world with no vision', () => {
  const { truth, seats, move, packets, row } = start()
  // A rule asks during a step and reads the sight the step began with, so the truth steps once
  // more, with nothing moving, before the rule's answers are read.
  const check = () => {
    truth.step(DT)
    const sent = packets().map(p => p.rows)
    for (const [slot] of seats.entries())
      for (const r of truth.rows) expect([slot, r.data.name, sees(truth.world, slot, r)]).toEqual([slot, r.data.name, sent[slot].includes(r.data.name)])
    // A rule asks the same: each scout's `tick` wrote the crates its team saw.
    for (const slot of [0, 1]) expect(row(`scout${slot}`).data.spots).toEqual(truth.rows.filter(r => r.kind === 'crate' && sent[slot].includes(r.data.name)).map(r => r.data.name).sort())
  }
  check()
  move('scout1', [35, 15])
  check()
  expect(row('scout1').data.spots).toEqual(['edge', 'near'])
  move('scout0', [105, 75])
  check()
  expect(row('scout0').data.spots).toEqual(['far'])
  // A world vision was never attached to, as a truth's is before the player addon first seats or
  // counts a seat on it (`join`, `free`): every row is seen.
  const bare = boot(scene(), sim)
  expect(bare.rows.every((r: Row) => sees(bare.world, 0, r))).toBe(true)
})

test('a rule is told what its team saw as the step began, whether the row that moved a seer this step ran before it or not', () => {
  // no packet is made between steps: the grids come from the rows as each step begins
  for (const runsFirst of ['runner', 'looker']) {
    const file = scene()
    file.prefabs.runner = { name: '', slot: 0, pos: [0, 0] }
    file.prefabs.looker = { name: '', slot: 0, pos: [0, 0], saw: [] }
    const moveTo = [105, 75]
    const own: Sim = {
      ...sim,
      // a seer that walks under the far crate in its tick
      runner: { tick(me) { me.data.pos = moveTo } },
      looker: { tick(me, _dt, w) { me.data.saw.push(sees(w.world, 0, w.find('crate', c => c.data.name === 'far'))) } },
    }
    file.world!.vision.sight.runner = 2
    const rest = file.actors!.filter(a => a.is !== 'scout')
    file.actors = [
      ...(runsFirst === 'runner' ? [{ is: 'runner', pos: [15, 15] }, { is: 'looker', pos: [15, 15] }] : [{ is: 'looker', pos: [15, 15] }, { is: 'runner', pos: [15, 15] }]),
      ...rest,
    ]
    const truth = boot(file, own)
    vision(truth, () => 0)
    truth.step(DT)
    truth.step(DT)
    const looker = truth.rows.find(r => r.kind === 'looker')!
    // the step the runner moved, its team did not yet see the far crate; the step after, it did
    expect([runsFirst, looker.data.saw]).toEqual([runsFirst, [false, true]])
  }
})

test('a vision block of the wrong shape throws naming the value', () => {
  const bad = (edit: (block: any) => void) => {
    const file = scene()
    edit(file.world!.vision)
    return () => start([0], file)
  }
  const listed = scene()
  listed.world!.vision = [10]
  expect(() => start([0], listed)).toThrow('vision is [10]: world.vision is an object')
  expect(bad(b => { b.cell = 0 })).toThrow('vision.cell is 0: a cell is a number of world units above 0')
  expect(bad(b => { b.size = [20, 2.5] })).toThrow('vision.size is [20,2.5]: the size is [across, down] in whole cells')
  expect(bad(b => { b.at = '' })).toThrow('vision.at is "": at is the name of a field')
  expect(bad(b => { delete b.slot })).toThrow('vision.slot is undefined: slot is the name of a field')
  expect(bad(b => { b.teams = 'red' })).toThrow('vision.teams is "red": teams is a list, a team for each slot')
  expect(bad(b => { b.sight = null })).toThrow('vision.sight is null: sight is each kind that sees and its cells')
  expect(bad(b => { b.sight = { ghost: 2 } })).toThrow('vision.sight is {"ghost":2}: ghost is a kind with a prefab, seeing a number of cells')
  expect(bad(b => { b.sight = { scout: -1 } })).toThrow('vision.sight is {"scout":-1}: scout is a kind with a prefab, seeing a number of cells')
  expect(bad(b => { b.always = ['geyser', 'ghost'] })).toThrow('vision.always is ["geyser","ghost"]: always lists kinds the scene has prefabs for')
})
