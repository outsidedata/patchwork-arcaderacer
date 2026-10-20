// The interest addon: each seat is sent the rows within the block's radius of its centre, the
// `always` kinds and the rows with no `pos`.
//
// The tests boot a scene written here, on the player addon's `join`. Each `player` row spawns a
// `hero` at its slot's `start` actor's `at` (a start has no `pos`, so every seat is sent both), and
// names it in `hero`, which the block's `at` reads. A
// player's `walk` moves its hero with `w.call`. Crates lie near each start: `a1` and `a2` by slot 0's
// at [0, 0], `a2` high above the ground, and `b1` by slot 1's at [100, 0]. A `banner`, an `always`
// kind, stands far from both, and a `sky` has no `pos`. The radius is 5.
import { expect, test } from 'vitest'
import { boot, type Packet, type Row, type Scene, type Sim } from '#engine/engine.ts'
import { join } from '#addons/player/player.addon.ts'
import { interest } from './interest.addon.ts'

const DT = 1 / 60

const scene = (): Scene => ({
  prefabs: {
    player: { seat: 0, hero: 0 },
    hero: { of: 0, pos: [0, 0] },
    crate: { name: '', pos: [0, 0] },
    banner: { pos: [0, 0] },
    sky: {},
    start: { slot: 0, at: [0, 0] },
  },
  actors: [
    { is: 'start', slot: 0, at: [0, 0] },
    { is: 'start', slot: 1, at: [100, 0] },
    { is: 'crate', name: 'a1', pos: [2, 1] },
    { is: 'crate', name: 'a2', pos: [3, 0, 1000] },
    { is: 'crate', name: 'b1', pos: [101, -2] },
    { is: 'banner', pos: [50, 50] },
    { is: 'sky' },
  ],
  seats: 2,
  interest: { radius: 5, always: ['banner'], at: 'hero' },
})

const sim: Sim = {
  player: {
    before(me, _dt, w) { if (!me.data.hero) me.data.hero = w.spawn('hero', { of: me.data.seat, pos: [...w.find('start', s => s.data.slot === me.data.seat).data.at] }).id },
    acts: { walk: (me, w, seat, dx: number, dy: number) => w.call(w.get(me.data.hero), 'walk', seat, dx, dy) },
  },
  hero: { acts: { walk(me, _w, _seat, dx: number, dy: number) { me.data.pos = [me.data.pos[0] + dx, me.data.pos[1] + dy] } } },
  crate: {},
  banner: {},
  sky: {},
  start: {},
}

// What a row is called in these tests.
const label = (r: Row) => r.kind === 'crate' ? r.data.name : r.kind === 'hero' ? `hero${r.data.of}` : r.kind === 'player' ? `player${r.data.seat}` : r.kind === 'start' ? `start${r.data.slot}` : r.kind

const start = (file = scene()) => {
  const truth = boot(file, sim)
  const seats: number[] = []
  const player = (slot: number) => truth.rows.find(r => r.kind === 'player' && r.data.seat === slot)
  let lookups = 0
  interest(truth, seat => { lookups++; return player(seats.indexOf(seat)) })
  seats.push(join(truth), join(truth))
  let seq = 0
  const walk = (slot: number, dx: number, dy: number) => {
    truth.inbox(seats[slot], { seq: ++seq, n: truth.n, id: player(slot)!.id, action: 'walk', args: [dx, dy] })
    truth.step(DT)
  }
  // Each seat's packet, as labels: the rows it is sent, and those born and ended since its last.
  const packets = () => seats.map(seat => {
    const p: Packet = truth.packet(seat)
    const named = (ids: number[]) => ids.map(id => label(truth.rows.find(r => r.id === id) ?? { id, kind: 'gone', data: {} })).sort()
    return { rows: p.rows.map(label).sort(), born: named(p.born), ended: named(p.ended) }
  })
  return { truth, seats, player, walk, packets, lookups: () => lookups }
}

test('each seat is sent its own surroundings, the always kinds and the rows with no pos', () => {
  const { truth, packets } = start()
  truth.step(DT)
  const [a, b] = packets()
  // A player row has no pos, so every seat is sent both.
  expect(a.rows).toEqual(['a1', 'a2', 'banner', 'hero0', 'player0', 'player1', 'sky', 'start0', 'start1'])
  expect(b.rows).toEqual(['b1', 'banner', 'hero1', 'player0', 'player1', 'sky', 'start0', 'start1'])
  // The truth's own rows are all there: only the packets leave rows out.
  expect(truth.rows.map(label).sort()).toEqual(['a1', 'a2', 'b1', 'banner', 'hero0', 'hero1', 'player0', 'player1', 'sky', 'start0', 'start1'])
})

test('walking together makes the other hero and its crates born, and walking apart ends them', () => {
  const { truth, walk, packets } = start()
  truth.step(DT)
  packets()
  // Slot 1's hero walks to [9, 0]: out of reach of its own crate, and of everything by slot 0.
  walk(1, -91, 0)
  expect(packets().map(p => [p.born, p.ended])).toEqual([[[], []], [[], ['b1']]])
  // At [6, 0] slot 0's crates are within its radius, and it is one cell outside slot 0's.
  walk(1, -3, 0)
  expect(packets().map(p => [p.born, p.ended])).toEqual([[[], []], [['a1', 'a2'], []]])
  // At [5, 0] the two heroes are exactly the radius apart, and each is sent the other.
  walk(1, -1, 0)
  const [a, b] = packets()
  expect([a.born, a.ended]).toEqual([['hero1'], []])
  expect([b.born, b.ended]).toEqual([['hero0'], []])
  expect(a.rows).toEqual(['a1', 'a2', 'banner', 'hero0', 'hero1', 'player0', 'player1', 'sky', 'start0', 'start1'])
  // Back to its own start.
  walk(1, 95, 0)
  const [c, d] = packets()
  expect([c.born, c.ended]).toEqual([[], ['hero1']])
  expect([d.born, d.ended]).toEqual([['b1'], ['a1', 'a2', 'hero0']])
})

test('a seat whose centre row does not exist is sent only the always kinds and the rows with no pos', () => {
  const { truth, packets } = start()
  // Before the first step no `player` row has spawned its hero, so `hero` names no row.
  expect(packets().map(p => p.rows)).toEqual([['banner', 'player0', 'player1', 'sky', 'start0', 'start1'], ['banner', 'player0', 'player1', 'sky', 'start0', 'start1']])
  // A seat that possesses nothing has no centre either.
  const bare = truth.open()
  truth.step(DT)
  expect(truth.packet(bare).rows.map(label).sort()).toEqual(['banner', 'player0', 'player1', 'sky', 'start0', 'start1'])
})

test('without at the centre is the possessed row itself, and one with no pos centres nothing', () => {
  const file = scene()
  delete (file.interest as any).at
  const { truth, player, packets } = start(file)
  truth.step(DT)
  expect(packets().map(p => p.rows)).toEqual([['banner', 'player0', 'player1', 'sky', 'start0', 'start1'], ['banner', 'player0', 'player1', 'sky', 'start0', 'start1']])
  player(0)!.data.pos = [100, 0]
  expect(packets()[0].rows).toEqual(['b1', 'banner', 'hero1', 'player0', 'player1', 'sky', 'start0', 'start1'])
})

test('the centre is looked up once per seat per step, and its pos is read where it is at each packet', () => {
  const { truth, packets, lookups } = start()
  truth.step(DT)
  const before = lookups()
  packets()
  expect(lookups() - before).toBe(2)
  // Moved between two packets of one step: the second packet measures from where it is now.
  truth.rows.find(r => label(r) === 'hero1')!.data.pos = [4, 0]
  expect(packets()[0].born).toEqual(['hero1'])
  expect(lookups() - before).toBe(2)
  truth.step(DT)
  packets()
  expect(lookups() - before).toBe(4)
})

test('a scene with no interest block, and a block of the wrong shape, throw naming the value', () => {
  const bad = (edit: (block: any) => void) => {
    const file = scene()
    edit(file.interest)
    return () => start(file)
  }
  const none = scene()
  delete none.interest
  expect(() => start(none)).toThrow('a scene given interest has no interest block')
  const listed = scene()
  listed.interest = [5]
  expect(() => start(listed)).toThrow('interest is [5]: the block is an object')
  expect(bad(b => { b.radious = 5 })).toThrow('interest.radious is not a field: the block holds radius, always and at')
  expect(bad(b => { b.radius = 0 })).toThrow('interest.radius is 0: a radius is a number of cells above 0')
  expect(bad(b => { b.radius = '5' })).toThrow('interest.radius is "5": a radius is a number of cells above 0')
  expect(bad(b => { delete b.radius })).toThrow('interest.radius is undefined: a radius is a number of cells above 0')
  expect(bad(b => { b.always = 'banner' })).toThrow('interest.always is "banner": always is a list of kinds')
  expect(bad(b => { b.always = ['banner', 'ghost'] })).toThrow('interest.always names "ghost": always lists kinds the scene has prefabs for')
  expect(bad(b => { b.at = '' })).toThrow('interest.at is "": at is the name of a field')
})
